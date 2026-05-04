// Models occasionally wrap JSON in ```json ... ``` fences or prepend
// a sentence even when told not to. This helper extracts the first
// JSON object it can find and parses it.

export function extractJson<T = unknown>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty AI response");
  }

  const trimmed = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Fast path: it's already valid JSON
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // fall through to brace scan
  }

  // Fallback: find the first { ... } that parses.
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = candidate.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice) as T;
    } catch (err) {
      throw new Error(
        `AI response did not contain valid JSON: ${(err as Error).message}`,
      );
    }
  }

  throw new Error("AI response did not contain a JSON object");
}
