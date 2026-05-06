import type { SiteDesignDNA } from "./types";

// Convert the extracted DNA into a `:root { --token: value; }` block that gets
// injected into the iframe shell ahead of the hero CSS. Future sections can
// reference these tokens (e.g. `var(--ww-color-primary)`) and stay visually
// aligned even as DNA evolves.
//
// Strategy:
// 1. Emit canonical tokens derived from palette, fonts, and shape language.
// 2. Emit any custom palette entries.
// 3. Merge `cssVariables` from DNA on top — that field is the AI's free-form
//    extension and is allowed to override the canonical tokens.

function quoteFontStack(font: string | undefined): string | null {
  if (!font || font.trim().length === 0) return null;
  // If the AI returned a comma-separated stack, preserve it verbatim. If it's
  // a single family with spaces, wrap in quotes so it parses correctly.
  const trimmed = font.trim();
  if (trimmed.includes(",")) return trimmed;
  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

function appendIf(
  target: Record<string, string>,
  name: string,
  value: string | undefined | null,
): void {
  if (typeof value === "string" && value.trim().length > 0) {
    target[name] = value.trim();
  }
}

export function buildGlobalDesignTokenCss(
  dna: SiteDesignDNA | null | undefined,
): string {
  if (!dna) return "";

  const tokens: Record<string, string> = {};

  // Palette
  appendIf(tokens, "--ww-color-primary", dna.palette.primary);
  appendIf(tokens, "--ww-color-secondary", dna.palette.secondary);
  appendIf(tokens, "--ww-color-accent", dna.palette.accent);
  appendIf(tokens, "--ww-color-background", dna.palette.background);
  appendIf(tokens, "--ww-color-surface", dna.palette.surface);
  appendIf(tokens, "--ww-color-text", dna.palette.text);
  appendIf(tokens, "--ww-color-muted-text", dna.palette.mutedText);
  appendIf(tokens, "--ww-color-gold", dna.palette.gold);
  appendIf(tokens, "--ww-color-green", dna.palette.green);

  if (dna.palette.custom) {
    for (const [key, value] of Object.entries(dna.palette.custom)) {
      const safeKey = key.startsWith("--") ? key : `--ww-color-${key}`;
      appendIf(tokens, safeKey, value);
    }
  }

  // Fonts
  const heading = quoteFontStack(dna.fonts.heading);
  const body = quoteFontStack(dna.fonts.body);
  const accent = quoteFontStack(dna.fonts.accent);
  if (heading) tokens["--ww-font-heading"] = heading;
  if (body) tokens["--ww-font-body"] = body;
  if (accent) tokens["--ww-font-accent"] = accent;

  // Shape language — only emit if values look like CSS lengths/values rather
  // than descriptive text. We keep the check light — anything containing
  // `px`, `rem`, `em`, `%`, or `var(` passes through.
  const looksLikeCssLength = (v: string | undefined): boolean =>
    typeof v === "string" &&
    /(px|rem|em|%|var\()/.test(v.trim());

  if (looksLikeCssLength(dna.shapeLanguage.borderRadius)) {
    tokens["--ww-radius"] = dna.shapeLanguage.borderRadius.trim();
  }
  if (looksLikeCssLength(dna.shapeLanguage.cardRadius)) {
    tokens["--ww-radius-card"] = dna.shapeLanguage.cardRadius.trim();
  }
  if (looksLikeCssLength(dna.shapeLanguage.sectionRadius)) {
    tokens["--ww-radius-section"] = (dna.shapeLanguage.sectionRadius ?? "").trim();
  }

  // DNA-supplied free-form variables — last so they win on conflict.
  for (const [key, value] of Object.entries(dna.cssVariables ?? {})) {
    const safeKey = key.startsWith("--") ? key : `--${key}`;
    appendIf(tokens, safeKey, value);
  }

  const entries = Object.entries(tokens);
  if (entries.length === 0) return "";

  const body_ = entries.map(([name, value]) => `  ${name}: ${value};`).join("\n");
  return `:root {\n${body_}\n}`;
}
