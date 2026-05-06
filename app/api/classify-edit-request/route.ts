import { NextResponse } from "next/server";
import { classifyEditRequest } from "@/lib/ai";
import type { HeroResult } from "@/lib/ai/types";
import { validateHero } from "@/lib/validateHero";
import { validateIntake, validateProvider } from "@/lib/validateIntake";

export const runtime = "nodejs";

const FALLBACK = {
  scope: "section_style" as const,
  shouldUpdateDNA: false,
  reason: "Classifier failed, defaulted to local section edit.",
};

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

  const { provider, model, intake, currentHero, designDNA, message } = (body ||
    {}) as {
    provider?: unknown;
    model?: unknown;
    intake?: unknown;
    currentHero?: unknown;
    designDNA?: unknown;
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

  const heroValidation = validateHero(
    currentHero as Partial<HeroResult> | null | undefined,
  );
  if (!heroValidation.ok) {
    return NextResponse.json(
      {
        success: false,
        message: `Invalid currentHero: ${heroValidation.errors.join(" ")}`,
      },
      { status: 400 },
    );
  }

  try {
    const classification = await classifyEditRequest({
      provider,
      model: typeof model === "string" ? model : undefined,
      intake: intakeCheck.intake,
      currentHero: currentHero as HeroResult,
      // designDNA is optional and free-form for the classifier; passing
      // through whatever the client sends keeps the classifier prompt informed
      // without requiring a strict shape check on this hot path.
      designDNA:
        designDNA && typeof designDNA === "object"
          ? (designDNA as never)
          : null,
      message: message.trim(),
    });
    return NextResponse.json({ success: true, classification });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[classify-edit-request] classifier failed:", err);
    }
    return NextResponse.json({ success: true, classification: FALLBACK });
  }
}
