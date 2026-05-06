import { NextResponse } from "next/server";
import { extractDesignDNA } from "@/lib/ai";
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

  const { provider, model, intake, hero } = (body || {}) as {
    provider?: unknown;
    model?: unknown;
    intake?: unknown;
    hero?: unknown;
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

  const heroValidation = validateHero(hero as Partial<HeroResult> | null | undefined);
  if (!heroValidation.ok) {
    return NextResponse.json(
      {
        success: false,
        message: `Invalid hero: ${heroValidation.errors.join(" ")}`,
      },
      { status: 400 },
    );
  }

  const heroResult = hero as HeroResult;

  try {
    const designDNA = await extractDesignDNA({
      provider,
      model: typeof model === "string" ? model : undefined,
      intake: intakeCheck.intake,
      hero: heroResult,
    });
    return NextResponse.json({ success: true, designDNA });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return NextResponse.json(
      { success: false, message: `DNA extraction failed: ${message}` },
      { status: 502 },
    );
  }
}
