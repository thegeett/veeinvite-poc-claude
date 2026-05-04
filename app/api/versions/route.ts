import { NextResponse } from "next/server";
import type { HeroResult } from "@/lib/ai/types";
import { buildPreviewHtml } from "@/lib/buildPreview";
import { listVersions, saveVersion } from "@/lib/versionsStore";
import { validateHero } from "@/lib/validateHero";
import { validateProvider } from "@/lib/validateIntake";

export const runtime = "nodejs";

export async function GET() {
  try {
    const versions = await listVersions();
    return NextResponse.json({ success: true, versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, message: `Failed to list versions: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { label, hero, provider, systemPrompt, userPrompt } = (body || {}) as {
    label?: unknown;
    hero?: unknown;
    provider?: unknown;
    systemPrompt?: unknown;
    userPrompt?: unknown;
  };

  if (!validateProvider(provider)) {
    return NextResponse.json(
      { success: false, message: 'provider must be "openai" or "anthropic".' },
      { status: 400 },
    );
  }

  if (typeof label !== "string" || label.trim().length === 0) {
    return NextResponse.json(
      { success: false, message: "label must be a non-empty string." },
      { status: 400 },
    );
  }

  if (typeof systemPrompt !== "string" || typeof userPrompt !== "string") {
    return NextResponse.json(
      { success: false, message: "systemPrompt and userPrompt must be strings." },
      { status: 400 },
    );
  }

  const validation = validateHero(hero as Partial<HeroResult> | null | undefined);
  if (!validation.ok) {
    return NextResponse.json(
      {
        success: false,
        message: `Invalid hero: ${validation.errors.join(" ")}`,
      },
      { status: 400 },
    );
  }

  const heroResult = hero as HeroResult;

  try {
    const version = await saveVersion({
      label: label.trim(),
      hero: heroResult,
      provider,
      systemPrompt,
      userPrompt,
      previewHtml: buildPreviewHtml(heroResult),
    });
    return NextResponse.json({ success: true, version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, message: `Failed to save version: ${message}` },
      { status: 500 },
    );
  }
}
