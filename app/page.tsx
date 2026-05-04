"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AIProvider, HeroResult, IntakeForm } from "@/lib/ai/types";
import { buildPreviewHtml } from "@/lib/buildPreview";
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

const STORAGE_KEY = "veeinvite-poc-state-v1";

interface PersistedState {
  intake: IntakeForm;
  provider: AIProvider;
  model: string;
  hero: HeroResult | null;
  chat: ChatMessage[];
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
  const [error, setError] = useState<string | null>(null);

  // Hydrate non-version state from localStorage once on mount.
  useEffect(() => {
    const persisted = loadPersisted();
    if (!persisted) return;
    if (persisted.intake) setIntake({ ...DEFAULT_INTAKE, ...persisted.intake });
    if (persisted.provider) setProvider(persisted.provider);
    if (typeof persisted.model === "string") setModel(persisted.model);
    if (persisted.hero) setHero(persisted.hero);
    if (Array.isArray(persisted.chat)) setChat(persisted.chat);
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
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota errors are non-fatal — POC keeps running with in-memory state.
    }
  }, [intake, provider, model, hero, chat]);

  const previewHtml = useMemo(() => buildPreviewHtml(hero), [hero]);

  function patchIntake<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setIntake((prev) => ({ ...prev, [key]: value }));
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
    setIsEditing(true);
    setChat((prev) => [...prev, { role: "user", content: message }]);
    setChatInput("");
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
        { role: "assistant", content: newHero.designNotes || "Updated." },
      ]);
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
    const blob = new Blob([buildPreviewHtml(hero)], { type: "text/html" });
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
        "Reset intake, hero, and chat?\nSaved versions in all_generated_version/ are kept on disk.",
      )
    )
      return;
    setIntake(DEFAULT_INTAKE);
    setHero(null);
    setChat([]);
    setChatInput("");
    setError(null);
  }

  return (
    <div className="flex h-screen flex-col bg-[#f5f3ef] text-[#1a1a1f]">
      <Topbar />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[360px_minmax(0,1fr)_360px]">
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
          isBusy={isGenerating || isEditing}
        />
        <ChatPanel
          chat={chat}
          chatInput={chatInput}
          setChatInput={setChatInput}
          onSendChat={onSendChat}
          isEditing={isEditing}
          heroExists={!!hero}
        />
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
