import type { AIProvider, IntakeForm } from "./ai/types";

const REQUIRED_INTAKE_FIELDS: (keyof IntakeForm)[] = [
  "brideName",
  "groomName",
  "weddingDate",
  "venue",
  "location",
  "community",
  "styleDirection",
  "mood",
  "language",
  "heroMessage",
];

export function validateProvider(p: unknown): p is AIProvider {
  return p === "openai" || p === "anthropic";
}

export function validateIntake(intake: unknown): {
  ok: boolean;
  errors: string[];
  intake?: IntakeForm;
} {
  const errors: string[] = [];
  if (!intake || typeof intake !== "object") {
    return { ok: false, errors: ["intake must be an object."] };
  }
  const obj = intake as Record<string, unknown>;
  for (const field of REQUIRED_INTAKE_FIELDS) {
    const value = obj[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`intake.${field} is required.`);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    errors,
    intake: {
      brideName: String(obj.brideName),
      groomName: String(obj.groomName),
      weddingDate: String(obj.weddingDate),
      venue: String(obj.venue),
      location: String(obj.location),
      community: String(obj.community),
      styleDirection: String(obj.styleDirection),
      mood: String(obj.mood),
      language: String(obj.language),
      heroMessage: String(obj.heroMessage),
      imageUrl:
        typeof obj.imageUrl === "string" && obj.imageUrl.trim().length > 0
          ? String(obj.imageUrl)
          : undefined,
    },
  };
}
