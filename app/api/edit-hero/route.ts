import { NextResponse } from "next/server";
import { editHero } from "@/lib/ai";
import { buildEditUserPrompt, EDIT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import type { HeroResult } from "@/lib/ai/types";
import { validateHero } from "@/lib/validateHero";
import { validateIntake, validateProvider } from "@/lib/validateIntake";

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

  const { provider, model, intake, currentHero, message } = (body || {}) as {
    provider?: unknown;
    model?: unknown;
    intake?: unknown;
    currentHero?: unknown;
    message?: unknown;
  };

  if (!validateProvider(provider)) {
    return NextResponse.json(
      { success: false, message: 'provider must be "openai" or "anthropic".' },
      { status: 400 },
    );
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { success: false, message: "message is required." },
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

  if (!currentHero || typeof currentHero !== "object") {
    return NextResponse.json(
      { success: false, message: "currentHero is required." },
      { status: 400 },
    );
  }

  const ch = currentHero as Record<string, unknown>;
  if (
    typeof ch.html !== "string" ||
    typeof ch.css !== "string" ||
    typeof ch.designNotes !== "string"
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "currentHero.html, currentHero.css, currentHero.designNotes are required strings.",
      },
      { status: 400 },
    );
  }

  let hero: HeroResult;
  try {
    hero = await editHero({
      provider,
      model: typeof model === "string" ? model : undefined,
      intake: intakeCheck.intake,
      message: message.trim(),
      currentHero: {
        sectionId: "hero_001",
        html: ch.html,
        css: ch.css,
        designNotes: ch.designNotes,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown AI error";
    return NextResponse.json(
      { success: false, message: `AI call failed: ${errMsg}` },
      { status: 502 },
    );
  }

  hero.sectionId = "hero_001";

  const validation = validateHero(hero);
  if (!validation.ok) {
    return NextResponse.json(
      {
        success: false,
        message: `Edited hero failed validation: ${validation.errors.join(" ")}`,
        hero,
      },
      { status: 422 },
    );
  }

  const editInput = {
    provider,
    model: typeof model === "string" ? model : undefined,
    intake: intakeCheck.intake,
    message: message.trim(),
    currentHero: {
      sectionId: "hero_001",
      html: ch.html,
      css: ch.css,
      designNotes: ch.designNotes,
    },
  };

  return NextResponse.json({
    success: true,
    hero,
    systemPrompt: EDIT_SYSTEM_PROMPT,
    userPrompt: buildEditUserPrompt(editInput),
  });
}
