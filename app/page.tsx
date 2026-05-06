"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AIProvider, HeroResult, IntakeForm } from "@/lib/ai/types";
import { buildPreviewHtml } from "@/lib/buildPreview";
import { buildGlobalDesignTokenCss } from "@/lib/design-dna/buildGlobalDesignTokenCss";
import { shouldRefreshDNAForIntakeChange } from "@/lib/design-dna/shouldRefreshDNAForIntakeChange";
import type {
  DesignDNAVersion,
  DesignDNAVersionSource,
  EditClassification,
  SiteDesignDNA,
} from "@/lib/design-dna/types";
import {
  COMMUNITY_OPTIONS,
  DEFAULT_INTAKE,
  STYLE_OPTIONS,
} from "@/lib/defaults";

type DeviceMode = "desktop" | "mobile";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface VersionEntry {
  id: string;
  label: string;
  hero: HeroResult;
}

interface PendingDnaNotice {
  source: DesignDNAVersionSource;
  reason: string;
}

const STORAGE_KEY = "veeinvite-poc-state-v1";

interface PersistedState {
  intake: IntakeForm;
  provider: AIProvider;
  model: string;
  hero: HeroResult | null;
  chat: ChatMessage[];
  // DNA itself is persisted on disk via /api/design-dna. We only keep the
  // diff-baseline (intakeAtDnaExtraction) in localStorage because it's per-tab
  // UI state, not a project artifact.
  intakeAtDnaExtraction: IntakeForm | null;
}

function loadPersisted(): Partial<PersistedState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return null;
  }
}

function labelForDnaSource(source: DesignDNAVersionSource): string {
  switch (source) {
    case "initial_generation":
      return "Initial Design DNA";
    case "manual_refresh":
      return "Manual DNA refresh";
    case "global_design_edit":
      return "DNA refresh after global design edit";
    case "intake_change":
      return "DNA refresh after intake change";
    default: {
      // Compile-time check that every union member is handled. Catches the
      // case where someone adds a new DesignDNAVersionSource and forgets to
      // update this function — the assignment below would fail to type-check.
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export default function Page() {
  const [intake, setIntake] = useState<IntakeForm>(DEFAULT_INTAKE);
  const [provider, setProvider] = useState<AIProvider>("anthropic");
  const [model, setModel] = useState<string>("");
  const [hero, setHero] = useState<HeroResult | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isExtractingDna, setIsExtractingDna] = useState(false);
  const [isClassifyingEdit, setIsClassifyingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [designDNA, setDesignDNA] = useState<SiteDesignDNA | null>(null);
  const [dnaVersions, setDnaVersions] = useState<DesignDNAVersion[]>([]);
  const [intakeAtDnaExtraction, setIntakeAtDnaExtraction] =
    useState<IntakeForm | null>(null);
  const [pendingDnaNotice, setPendingDnaNotice] =
    useState<PendingDnaNotice | null>(null);

  // Hydrate non-version state from localStorage once on mount.
  useEffect(() => {
    const persisted = loadPersisted();
    if (!persisted) return;
    if (persisted.intake) setIntake({ ...DEFAULT_INTAKE, ...persisted.intake });
    if (persisted.provider) setProvider(persisted.provider);
    if (typeof persisted.model === "string") setModel(persisted.model);
    if (persisted.hero) setHero(persisted.hero);
    if (Array.isArray(persisted.chat)) setChat(persisted.chat);
    if (persisted.intakeAtDnaExtraction) {
      setIntakeAtDnaExtraction(persisted.intakeAtDnaExtraction);
    }
  }, []);

  // Hydrate Design DNA versions from the server (all_generated_design_dna/).
  // The most recent version becomes the current designDNA.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/design-dna");
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.versions)) {
          const list = data.versions as DesignDNAVersion[];
          setDnaVersions(list);
          if (list.length > 0) {
            setDesignDNA(list[list.length - 1].designDNA);
          }
        }
      } catch {
        // Network errors are non-fatal — UI works without prior DNA history.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate version history from the server (all_generated_version/ directory).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/versions");
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.versions)) {
          setVersions(
            data.versions.map((v: { id: string; label: string; hero: HeroResult }) => ({
              id: v.id,
              label: v.label,
              hero: v.hero,
            })),
          );
        }
      } catch {
        // Network errors are non-fatal — UI still works without prior history.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: PersistedState = {
      intake,
      provider,
      model,
      hero,
      chat,
      intakeAtDnaExtraction,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota errors are non-fatal — POC keeps running with in-memory state.
    }
  }, [intake, provider, model, hero, chat, intakeAtDnaExtraction]);

  const designTokenCss = useMemo(
    () => buildGlobalDesignTokenCss(designDNA),
    [designDNA],
  );

  const previewHtml = useMemo(
    () => buildPreviewHtml({ hero, designTokenCss }),
    [hero, designTokenCss],
  );

  // Compute the candidate intake-driven notice as a pure derivation so the
  // reconciler effect below can react to *changes in the candidate*, not to
  // every change in the notice it itself writes.
  const intakeNoticeCandidate = useMemo<PendingDnaNotice | null>(() => {
    const diff = shouldRefreshDNAForIntakeChange(intakeAtDnaExtraction, intake);
    return diff.shouldRefreshDNA
      ? { source: "intake_change", reason: diff.reasons.join(" ") }
      : null;
  }, [intake, intakeAtDnaExtraction]);

  // Hold the latest pendingDnaNotice in a ref so the reconciler can read it
  // without becoming a fragile read/write loop on its own dep array.
  const pendingDnaNoticeRef = useRef<PendingDnaNotice | null>(null);
  useEffect(() => {
    pendingDnaNoticeRef.current = pendingDnaNotice;
  }, [pendingDnaNotice]);

  // Reconcile candidate → pendingDnaNotice. A `global_design_edit` notice
  // from chat blocks intake-driven overrides until the user takes action.
  useEffect(() => {
    if (pendingDnaNoticeRef.current?.source === "global_design_edit") return;
    if (intakeNoticeCandidate) {
      setPendingDnaNotice(intakeNoticeCandidate);
    } else if (pendingDnaNoticeRef.current?.source === "intake_change") {
      setPendingDnaNotice(null);
    }
  }, [intakeNoticeCandidate]);

  function patchIntake<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setIntake((prev) => ({ ...prev, [key]: value }));
  }

  // ============================================================
  // Design DNA helpers
  // ============================================================

  async function pushDnaVersion(
    label: string,
    dna: SiteDesignDNA,
    source: DesignDNAVersionSource,
  ): Promise<DesignDNAVersion | null> {
    try {
      const res = await fetch("/api/design-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          designDNA: dna,
          source,
          provider,
          model: model.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.version) {
        const v = data.version as DesignDNAVersion;
        setDnaVersions((prev) => [...prev, v]);
        return v;
      }
      setError(data.message || "Failed to save Design DNA on disk.");
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Design DNA.");
      return null;
    }
  }

  async function extractDnaFromCurrent(
    heroForExtraction: HeroResult,
    intakeForExtraction: IntakeForm,
    options?: { silent?: boolean },
  ): Promise<SiteDesignDNA | null> {
    setIsExtractingDna(true);
    const reportFailure = (msg: string) => {
      if (options?.silent) {
        // Auto-extract path (e.g. right after Generate Hero) is documented
        // as best-effort — the hero itself is fine. Funnel into a system
        // chat breadcrumb instead of a red banner so the working hero
        // doesn't look broken.
        setChat((prev) => [
          ...prev,
          {
            role: "system",
            content: `Couldn't auto-extract Design DNA: ${msg}`,
          },
        ]);
      } else {
        setError(msg);
      }
    };
    try {
      const res = await fetch("/api/extract-design-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || undefined,
          intake: intakeForExtraction,
          hero: heroForExtraction,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.designDNA) {
        reportFailure(data.message || "DNA extraction failed.");
        return null;
      }
      return data.designDNA as SiteDesignDNA;
    } catch (err) {
      reportFailure(err instanceof Error ? err.message : "DNA extraction failed.");
      return null;
    } finally {
      setIsExtractingDna(false);
    }
  }

  async function refreshDna(
    source: DesignDNAVersionSource,
    label?: string,
  ): Promise<void> {
    if (!hero) {
      setError("Generate a hero first before refreshing Design DNA.");
      return;
    }
    const dna = await extractDnaFromCurrent(hero, intake);
    if (!dna) return;
    setDesignDNA(dna);
    setIntakeAtDnaExtraction(intake);
    await pushDnaVersion(label ?? labelForDnaSource(source), dna, source);
    setPendingDnaNotice(null);
    setChat((prev) => [
      ...prev,
      {
        role: "system",
        content:
          source === "manual_refresh"
            ? "Design DNA refreshed manually."
            : source === "global_design_edit"
              ? "Design DNA refreshed after global design edit."
              : source === "intake_change"
                ? "Design DNA refreshed because intake changed."
                : "Design DNA refreshed.",
      },
    ]);
  }

  function dismissDnaNotice(): void {
    if (pendingDnaNotice?.source === "intake_change") {
      // Treat "Keep existing DNA" as accepting the current intake for diff
      // purposes — same field changing again later won't re-fire the notice.
      setIntakeAtDnaExtraction(intake);
    }
    setPendingDnaNotice(null);
  }

  function restoreDnaVersion(id: string): void {
    const v = dnaVersions.find((x) => x.id === id);
    if (!v) return;
    setDesignDNA(v.designDNA);
    // The user is declaring this DNA correct for their current state, so the
    // intake-change watcher should treat the *current* intake as the new
    // baseline. Future intake changes from this point will trigger a notice.
    setIntakeAtDnaExtraction(intake);
    setPendingDnaNotice(null);
    setChat((prev) => [
      ...prev,
      {
        role: "system",
        content: `Restored Design DNA: ${v.label} (${v.id}).`,
      },
    ]);
  }

  async function pushVersion(
    label: string,
    h: HeroResult,
    systemPrompt: string,
    userPrompt: string,
  ) {
    try {
      const res = await fetch("/api/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          hero: h,
          provider,
          systemPrompt,
          userPrompt,
        }),
      });
      const data = await res.json();
      if (data.success && data.version) {
        const v: VersionEntry = {
          id: data.version.id,
          label: data.version.label,
          hero: data.version.hero,
        };
        setVersions((prev) => [...prev, v]);
        return;
      }
      setError(data.message || "Failed to save version on server.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save version.");
    }
  }

  async function onGenerate() {
    setError(null);
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || undefined,
          intake,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Generation failed.");
        return;
      }
      const newHero: HeroResult = data.hero;
      setHero(newHero);
      pushVersion(
        "Initial generation",
        newHero,
        typeof data.systemPrompt === "string" ? data.systemPrompt : "",
        typeof data.userPrompt === "string" ? data.userPrompt : "",
      );
      setChat([
        {
          role: "system",
          content: `Hero generated using ${provider}${model.trim() ? ` (${model.trim()})` : ""}. ${newHero.designNotes}`,
        },
      ]);

      // Auto-extract Design DNA from the new hero. Best-effort: failures
      // surface as a system chat breadcrumb (not a red banner) so the
      // freshly-generated hero doesn't look broken.
      const dna = await extractDnaFromCurrent(newHero, intake, { silent: true });
      if (dna) {
        setDesignDNA(dna);
        setIntakeAtDnaExtraction(intake);
        await pushDnaVersion("Initial Design DNA", dna, "initial_generation");
        setPendingDnaNotice(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function onSendChat() {
    const message = chatInput.trim();
    if (!message) return;
    if (!hero) {
      setError("Generate a hero first, then chat to edit it.");
      return;
    }
    setError(null);
    setChat((prev) => [...prev, { role: "user", content: message }]);
    setChatInput("");

    // 1. Classify the edit so the prompt and the DNA-notice flow can adapt.
    //    Server-side fallback returns section_style/false on classifier errors,
    //    so this call should always resolve with usable data. We still guard
    //    network failures and fall back locally to be safe.
    setIsClassifyingEdit(true);
    let classification: EditClassification = {
      scope: "section_style",
      shouldUpdateDNA: false,
      reason: "Classifier not called (network error). Treated as local section edit.",
    };
    try {
      const classifyRes = await fetch("/api/classify-edit-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || undefined,
          intake,
          currentHero: hero,
          designDNA,
          message,
        }),
      });
      const classifyData = await classifyRes.json();
      if (classifyData.success && classifyData.classification) {
        classification = classifyData.classification as EditClassification;
      }
    } catch {
      // keep fallback classification
    } finally {
      setIsClassifyingEdit(false);
    }

    // 2. Run the edit with the resolved scope.
    setIsEditing(true);
    try {
      const res = await fetch("/api/edit-hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || undefined,
          currentHero: {
            sectionId: hero.sectionId,
            html: hero.html,
            css: hero.css,
            designNotes: hero.designNotes,
          },
          message,
          intake,
          editScope: classification.scope,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Edit failed.");
        setChat((prev) => [
          ...prev,
          { role: "assistant", content: `Edit failed: ${data.message || "unknown error"}` },
        ]);
        return;
      }
      const newHero: HeroResult = data.hero;
      setHero(newHero);
      pushVersion(
        `Edit: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`,
        newHero,
        typeof data.systemPrompt === "string" ? data.systemPrompt : "",
        typeof data.userPrompt === "string" ? data.userPrompt : "",
      );
      setChat((prev) => [
        ...prev,
        {
          role: "system",
          content: `Edit classified as ${classification.scope}: ${classification.reason}`,
        },
        { role: "assistant", content: newHero.designNotes || "Updated." },
      ]);

      if (classification.shouldUpdateDNA) {
        setPendingDnaNotice({
          source: "global_design_edit",
          reason: classification.reason,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setIsEditing(false);
    }
  }

  function onRestoreVersion(id: string) {
    const v = versions.find((x) => x.id === id);
    if (!v) return;
    setHero(v.hero);
    setChat((prev) => [
      ...prev,
      { role: "system", content: `Restored ${v.label} (${v.id}).` },
    ]);
  }

  function onDownloadHtml() {
    if (!hero) return;
    const blob = new Blob([buildPreviewHtml({ hero, designTokenCss })], {
      type: "text/html",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wedding-hero.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function onResetAll() {
    if (
      !confirm(
        "Reset intake, hero, and chat?\nSaved hero versions in all_generated_version/ and saved Design DNA versions in all_generated_design_dna/ are kept on disk.",
      )
    )
      return;
    setIntake(DEFAULT_INTAKE);
    setHero(null);
    setChat([]);
    setChatInput("");
    setError(null);
    setIntakeAtDnaExtraction(null);
    setPendingDnaNotice(null);
    // Note: designDNA and dnaVersions stay in memory (and on disk). They will
    // re-hydrate from the server on next mount anyway.
  }

  const isBusy = isGenerating || isEditing || isExtractingDna || isClassifyingEdit;

  return (
    <div className="flex h-screen flex-col bg-[#f5f3ef] text-[#1a1a1f]">
      <Topbar />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[360px_minmax(0,1fr)_400px]">
        <IntakePanel
          intake={intake}
          patchIntake={patchIntake}
          provider={provider}
          setProvider={setProvider}
          model={model}
          setModel={setModel}
          isGenerating={isGenerating}
          onGenerate={onGenerate}
          onResetAll={onResetAll}
        />
        <PreviewPanel
          previewHtml={previewHtml}
          device={device}
          setDevice={setDevice}
          hero={hero}
          onDownloadHtml={onDownloadHtml}
          versions={versions}
          onRestoreVersion={onRestoreVersion}
          error={error}
          isBusy={isBusy}
        />
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <DesignDnaPanel
            designDNA={designDNA}
            dnaVersions={dnaVersions}
            pendingNotice={pendingDnaNotice}
            heroExists={!!hero}
            isExtracting={isExtractingDna}
            onRefreshDna={refreshDna}
            onDismissNotice={dismissDnaNotice}
            onRestoreDnaVersion={restoreDnaVersion}
          />
          <ChatPanel
            chat={chat}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendChat={onSendChat}
            isEditing={isEditing || isClassifyingEdit}
            heroExists={!!hero}
          />
        </div>
      </div>
    </div>
  );
}

function Topbar() {
  return (
    <header className="flex items-center justify-between border-b border-black/5 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-sm font-bold text-white">
          V
        </div>
        <div>
          <div className="text-sm font-semibold">VeeInvite</div>
          <div className="text-xs text-black/50">
            AI Wedding Hero Generator — POC
          </div>
        </div>
      </div>
      <div className="text-xs text-black/50">
        Server-side OpenAI / Anthropic · Hero section only
      </div>
    </header>
  );
}

interface IntakePanelProps {
  intake: IntakeForm;
  patchIntake: <K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) => void;
  provider: AIProvider;
  setProvider: (p: AIProvider) => void;
  model: string;
  setModel: (m: string) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  onResetAll: () => void;
}

function IntakePanel(props: IntakePanelProps) {
  const {
    intake,
    patchIntake,
    provider,
    setProvider,
    model,
    setModel,
    isGenerating,
    onGenerate,
    onResetAll,
  } = props;

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-black/5 bg-white">
      <header className="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <h2 className="text-sm font-semibold">Couple intake</h2>
        <button
          onClick={onResetAll}
          className="text-xs text-black/50 hover:text-black"
        >
          Reset
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Field label="Bride name">
          <Input
            value={intake.brideName}
            onChange={(v) => patchIntake("brideName", v)}
          />
        </Field>
        <Field label="Groom name">
          <Input
            value={intake.groomName}
            onChange={(v) => patchIntake("groomName", v)}
          />
        </Field>
        <Field label="Wedding date">
          <Input
            value={intake.weddingDate}
            onChange={(v) => patchIntake("weddingDate", v)}
            placeholder="March 22, 2026"
          />
        </Field>
        <Field label="Venue">
          <Input value={intake.venue} onChange={(v) => patchIntake("venue", v)} />
        </Field>
        <Field label="City / location">
          <Input
            value={intake.location}
            onChange={(v) => patchIntake("location", v)}
          />
        </Field>
        <Field label="Community / culture">
          <Select
            value={intake.community}
            options={[...COMMUNITY_OPTIONS]}
            onChange={(v) => patchIntake("community", v)}
          />
        </Field>
        <Field label="Style direction">
          <Select
            value={intake.styleDirection}
            options={[...STYLE_OPTIONS]}
            onChange={(v) => patchIntake("styleDirection", v)}
          />
        </Field>
        <Field label="Mood">
          <Input
            value={intake.mood}
            onChange={(v) => patchIntake("mood", v)}
            placeholder="festive, royal, emotional, rich, modern"
          />
        </Field>
        <Field label="Language preference">
          <Input
            value={intake.language}
            onChange={(v) => patchIntake("language", v)}
            placeholder="English, Gujarati, Hindi, Arabic, English + Gujarati"
          />
        </Field>
        <Field label="Hero message / invitation text">
          <Textarea
            value={intake.heroMessage}
            onChange={(v) => patchIntake("heroMessage", v)}
            rows={4}
          />
        </Field>
        <Field label="Hero image URL (optional)">
          <Input
            value={intake.imageUrl ?? ""}
            onChange={(v) => patchIntake("imageUrl", v)}
            placeholder="https://…"
          />
        </Field>

        <div className="my-2 border-t border-black/5" />

        <Field label="AI provider">
          <div className="grid grid-cols-2 gap-2">
            <ProviderButton
              active={provider === "openai"}
              onClick={() => setProvider("openai")}
              label="OpenAI / ChatGPT"
            />
            <ProviderButton
              active={provider === "anthropic"}
              onClick={() => setProvider("anthropic")}
              label="Anthropic / Claude"
            />
          </div>
        </Field>
        <Field
          label="Model (optional)"
          hint={
            provider === "openai"
              ? "Leave blank to use server default (gpt-4o)."
              : "Leave blank to use server default (claude-sonnet-4-6)."
          }
        >
          <Input
            value={model}
            onChange={setModel}
            placeholder={
              provider === "openai"
                ? "gpt-4o, gpt-4.1, …"
                : "claude-sonnet-4-6, …"
            }
          />
        </Field>
      </div>
      <footer className="border-t border-black/5 p-3">
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "Generating…" : "Generate Hero"}
        </button>
      </footer>
    </section>
  );
}

interface PreviewPanelProps {
  previewHtml: string;
  device: DeviceMode;
  setDevice: (d: DeviceMode) => void;
  hero: HeroResult | null;
  onDownloadHtml: () => void;
  versions: VersionEntry[];
  onRestoreVersion: (id: string) => void;
  error: string | null;
  isBusy: boolean;
}

function PreviewPanel(props: PreviewPanelProps) {
  const {
    previewHtml,
    device,
    setDevice,
    hero,
    onDownloadHtml,
    versions,
    onRestoreVersion,
    error,
    isBusy,
  } = props;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Set srcDoc imperatively after mount so iframe identity is stable.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = previewHtml;
  }, [previewHtml]);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-black/5 bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <div className="flex items-center gap-2">
          <DeviceToggle device={device} setDevice={setDevice} />
          <button
            onClick={onDownloadHtml}
            disabled={!hero}
            className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download HTML
          </button>
        </div>
      </header>
      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-auto bg-[#ece9e2] p-3">
        {isBusy ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/40 text-xs text-black/60 backdrop-blur-sm">
            Working…
          </div>
        ) : null}
        <div
          className="mx-auto h-full bg-white shadow-sm"
          style={{
            width: device === "mobile" ? 390 : "100%",
            maxWidth: "100%",
          }}
        >
          <iframe
            ref={iframeRef}
            title="Hero preview"
            className="h-full w-full border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
      <VersionStrip versions={versions} onRestore={onRestoreVersion} />
    </section>
  );
}

function VersionStrip({
  versions,
  onRestore,
}: {
  versions: VersionEntry[];
  onRestore: (id: string) => void;
}) {
  if (versions.length === 0) {
    return (
      <footer className="border-t border-black/5 px-4 py-2 text-xs text-black/50">
        Version history will appear here after you generate.
      </footer>
    );
  }
  return (
    <footer className="border-t border-black/5 px-3 py-2">
      <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-black/50">
        Versions
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => onRestore(v.id)}
            className="shrink-0 rounded-md border border-black/10 bg-white px-3 py-1.5 text-left text-xs hover:bg-black/5"
            title={v.label}
          >
            <div className="font-semibold">{v.id}</div>
            <div className="max-w-[180px] truncate text-black/50">{v.label}</div>
          </button>
        ))}
      </div>
    </footer>
  );
}

function DeviceToggle({
  device,
  setDevice,
}: {
  device: DeviceMode;
  setDevice: (d: DeviceMode) => void;
}) {
  return (
    <div className="flex rounded-md border border-black/10 p-0.5 text-xs">
      <button
        onClick={() => setDevice("desktop")}
        className={`rounded px-2.5 py-1 ${device === "desktop" ? "bg-black text-white" : "text-black/70 hover:bg-black/5"}`}
      >
        Desktop
      </button>
      <button
        onClick={() => setDevice("mobile")}
        className={`rounded px-2.5 py-1 ${device === "mobile" ? "bg-black text-white" : "text-black/70 hover:bg-black/5"}`}
      >
        Mobile
      </button>
    </div>
  );
}

interface ChatPanelProps {
  chat: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  onSendChat: () => void;
  isEditing: boolean;
  heroExists: boolean;
}

function ChatPanel({
  chat,
  chatInput,
  setChatInput,
  onSendChat,
  isEditing,
  heroExists,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat]);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-black/5 bg-white">
      <header className="border-b border-black/5 px-4 py-3">
        <h2 className="text-sm font-semibold">Chat editor</h2>
        <p className="text-xs text-black/50">
          Ask the AI to refine the hero. Each edit creates a new version.
        </p>
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {chat.length === 0 ? (
          <div className="rounded-md border border-dashed border-black/15 p-3 text-xs text-black/50">
            No messages yet. Generate a hero first, then describe what to change.
          </div>
        ) : (
          chat.map((m, i) => <ChatBubble key={i} m={m} />)
        )}
      </div>
      <footer className="border-t border-black/5 p-3">
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSendChat();
            }
          }}
          placeholder="Make it more royal Gujarati with gold, toran, diya animation, and less plain background."
          rows={3}
          className="w-full resize-none rounded-md border border-black/10 px-3 py-2 text-sm focus:border-black/40 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-black/40">⌘/Ctrl + Enter to send</span>
          <button
            onClick={onSendChat}
            disabled={isEditing || !heroExists || chatInput.trim().length === 0}
            className="rounded-md bg-black px-3.5 py-1.5 text-xs font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEditing ? "Editing…" : "Send"}
          </button>
        </div>
      </footer>
    </section>
  );
}

interface DesignDnaPanelProps {
  designDNA: SiteDesignDNA | null;
  dnaVersions: DesignDNAVersion[];
  pendingNotice: PendingDnaNotice | null;
  heroExists: boolean;
  isExtracting: boolean;
  onRefreshDna: (source: DesignDNAVersionSource, label?: string) => void;
  onDismissNotice: () => void;
  onRestoreDnaVersion: (id: string) => void;
}

function DesignDnaPanel(props: DesignDnaPanelProps) {
  const {
    designDNA,
    dnaVersions,
    pendingNotice,
    heroExists,
    isExtracting,
    onRefreshDna,
    onDismissNotice,
    onRestoreDnaVersion,
  } = props;

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-black/5 bg-white">
      <header className="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Site Design DNA</h2>
          <p className="text-[11px] text-black/50">
            Global visual identity for future sections
          </p>
        </div>
        <button
          onClick={() => onRefreshDna("manual_refresh")}
          disabled={!heroExists || isExtracting}
          className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          title={heroExists ? "Re-extract DNA from current Hero" : "Generate a hero first"}
        >
          {isExtracting ? "Refreshing…" : "Refresh DNA"}
        </button>
      </header>

      {pendingNotice ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="mb-1 font-semibold">
            {pendingNotice.source === "intake_change"
              ? "Your intake changes may affect the full design direction."
              : "This edit may affect the full website design direction."}
          </div>
          <div className="mb-2 text-amber-800/80">{pendingNotice.reason}</div>
          <div className="flex gap-2">
            <button
              onClick={() => onRefreshDna(pendingNotice.source)}
              disabled={isExtracting}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              Refresh Design DNA
            </button>
            <button
              onClick={onDismissNotice}
              className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Keep existing DNA
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {designDNA ? (
          <DnaSummary dna={designDNA} />
        ) : (
          <div className="rounded-md border border-dashed border-black/15 p-3 text-xs text-black/50">
            DNA will be extracted automatically after the first hero generation.
          </div>
        )}

        {dnaVersions.length > 0 ? (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-black/50">
              DNA history
            </div>
            <div className="space-y-1">
              {dnaVersions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{v.label}</div>
                    <div className="truncate text-[10px] text-black/40">
                      {v.id} · {v.source}
                    </div>
                  </div>
                  <button
                    onClick={() => onRestoreDnaVersion(v.id)}
                    className="shrink-0 rounded-md border border-black/10 px-2 py-1 text-[11px] hover:bg-black/5"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DnaSummary({ dna }: { dna: SiteDesignDNA }) {
  // Defense in depth: even though /api/design-dna validates the shape, an
  // older saved version on disk (from before the validator landed) might be
  // missing fields. Optional-chain everything so a stale entry can't crash
  // the panel.
  const palette = dna.palette ?? ({} as SiteDesignDNA["palette"]);
  const fonts = dna.fonts ?? ({} as SiteDesignDNA["fonts"]);
  const animationMood = dna.animationMood;
  const visualMotifs = Array.isArray(dna.visualMotifs) ? dna.visualMotifs : [];
  const sectionRules = Array.isArray(dna.sectionRules) ? dna.sectionRules : [];

  const swatches: { label: string; value: string | undefined }[] = [
    { label: "primary", value: palette.primary },
    { label: "secondary", value: palette.secondary },
    { label: "accent", value: palette.accent },
    { label: "background", value: palette.background },
    { label: "surface", value: palette.surface },
    { label: "text", value: palette.text },
    { label: "gold", value: palette.gold },
    { label: "green", value: palette.green },
  ];

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-black/50">Concept</div>
        <div className="font-semibold">{dna.concept}</div>
        <div className="text-black/70">{dna.tone}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="uppercase tracking-wide text-black/50">Community</div>
          <div className="text-black/80">{dna.community}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-black/50">Style</div>
          <div className="text-black/80">{dna.styleDirection}</div>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-black/50">Palette</div>
        <div className="flex flex-wrap gap-1.5">
          {swatches
            .filter((s) => s.value && s.value.trim().length > 0)
            .map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-1.5 py-1"
                title={`${s.label}: ${s.value}`}
              >
                <span
                  className="inline-block h-4 w-4 rounded border border-black/10"
                  style={{ background: s.value ?? "transparent" }}
                />
                <span className="text-[10px] text-black/60">{s.label}</span>
              </div>
            ))}
        </div>
      </div>
      <div>
        <div className="mb-0.5 text-[11px] uppercase tracking-wide text-black/50">Fonts</div>
        {fonts.heading ? (
          <div className="text-black/80">
            <span className="text-black/50">heading:</span> {fonts.heading}
          </div>
        ) : null}
        {fonts.body ? (
          <div className="text-black/80">
            <span className="text-black/50">body:</span> {fonts.body}
          </div>
        ) : null}
        {fonts.accent ? (
          <div className="text-black/80">
            <span className="text-black/50">accent:</span> {fonts.accent}
          </div>
        ) : null}
      </div>
      {visualMotifs.length > 0 ? (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-black/50">Motifs</div>
          <div className="flex flex-wrap gap-1">
            {visualMotifs.map((m) => (
              <span
                key={m}
                className="rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[10px] text-black/70"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {animationMood?.intensity ? (
        <div>
          <div className="mb-0.5 text-[11px] uppercase tracking-wide text-black/50">Animation</div>
          <div className="text-black/80">
            <span className="text-black/50">intensity:</span> {animationMood.intensity}
          </div>
        </div>
      ) : null}
      {sectionRules.length > 0 ? (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-black/50">
            Future-section rules
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-black/70">
            {sectionRules.slice(0, 6).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ChatBubble({ m }: { m: ChatMessage }) {
  const styles =
    m.role === "user"
      ? "ml-auto bg-black text-white"
      : m.role === "assistant"
        ? "bg-black/5 text-black"
        : "border border-dashed border-black/15 text-black/60";
  return (
    <div className={`max-w-[90%] rounded-md px-3 py-2 text-xs leading-relaxed ${styles}`}>
      <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-60">
        {m.role}
      </div>
      <div className="whitespace-pre-wrap">{m.content}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  // NOTE: rendered as <div>, not <label>. A <label> forwards bubbled
  // clicks to its first form control, which silently re-clicks the
  // OpenAI button when the user tries to pick Anthropic.
  return (
    <div className="block">
      <div className="mb-1 text-xs font-medium text-black/70">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-[11px] text-black/40">{hint}</div> : null}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-black/10 px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none"
    />
  );
}

function Textarea({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full resize-y rounded-md border border-black/10 px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none"
    />
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function ProviderButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
        active
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black/70 hover:bg-black/5"
      }`}
    >
      {label}
    </button>
  );
}
