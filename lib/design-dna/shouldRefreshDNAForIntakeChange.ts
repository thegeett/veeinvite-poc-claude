import type { IntakeForm } from "../ai/types";

export interface IntakeChangeAnalysis {
  shouldRefreshDNA: boolean;
  reasons: string[];
}

// Pure-string normalize so trailing spaces / case toggles don't trigger noise.
function norm(value: string | undefined | null): string {
  return (value ?? "").trim();
}

export function shouldRefreshDNAForIntakeChange(
  previousIntake: IntakeForm | null | undefined,
  nextIntake: IntakeForm,
): IntakeChangeAnalysis {
  if (!previousIntake) {
    return { shouldRefreshDNA: false, reasons: [] };
  }

  const reasons: string[] = [];

  if (norm(previousIntake.community) !== norm(nextIntake.community)) {
    reasons.push("Community / culture changed.");
  }
  if (norm(previousIntake.styleDirection) !== norm(nextIntake.styleDirection)) {
    reasons.push("Style direction changed.");
  }
  if (norm(previousIntake.mood) !== norm(nextIntake.mood)) {
    reasons.push("Mood changed.");
  }
  if (norm(previousIntake.language) !== norm(nextIntake.language)) {
    reasons.push("Language preference changed.");
  }

  const prevHasImage = norm(previousIntake.imageUrl).length > 0;
  const nextHasImage = norm(nextIntake.imageUrl).length > 0;
  if (prevHasImage !== nextHasImage) {
    reasons.push(
      nextHasImage
        ? "Hero image was added."
        : "Hero image was removed.",
    );
  }

  return { shouldRefreshDNA: reasons.length > 0, reasons };
}
