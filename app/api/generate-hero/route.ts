import { NextResponse } from "next/server";
import { generateHero } from "@/lib/ai";
import {
  buildGenerateUserPrompt,
  GENERATE_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import type { HeroResult } from "@/lib/ai/types";
import { validateHero } from "@/lib/validateHero";
import { validateIntake, validateProvider } from "@/lib/validateIntake";

// Server-side only — API keys are never exposed to the browser.
export const runtime = "nodejs";

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

  const { provider, model, intake } = (body || {}) as {
    provider?: unknown;
    model?: unknown;
    intake?: unknown;
  };

  if (!validateProvider(provider)) {
    return NextResponse.json(
      { success: false, message: 'provider must be "openai" or "anthropic".' },
      { status: 400 },
    );
  }

  const intakeCheck = validateIntake(intake);
  if (!intakeCheck.ok || !intakeCheck.intake) {
    return NextResponse.json(
      { success: false, message: intakeCheck.errors.join(" ") },
      { status: 400 },
    );
  }

  let hero: HeroResult;
  try {
    hero = await generateHero({
      provider,
      model: typeof model === "string" ? model : undefined,
      intake: intakeCheck.intake,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return NextResponse.json(
      { success: false, message: `AI call failed: ${message}` },
      { status: 502 },
    );
  }

  // Force the canonical sectionId — the prompt asks for it but we don't
  // want to trust the model to always honor that.
  hero.sectionId = "hero_001";

  const validation = validateHero(hero);
  if (!validation.ok) {
    return NextResponse.json(
      {
        success: false,
        message: `Generated hero failed validation: ${validation.errors.join(" ")}`,
        hero,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    success: true,
    hero,
    systemPrompt: GENERATE_SYSTEM_PROMPT,
    userPrompt: buildGenerateUserPrompt(intakeCheck.intake),
  });
}
