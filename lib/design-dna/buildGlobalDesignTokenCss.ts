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

// Reject anything that could break out of the surrounding `<style>` block
// or smuggle attribute injection into a CSS value/key. A poisoned token
// containing `</style>` would close the style element and let attacker
// HTML render in the iframe (which is `allow-same-origin`). Even without
// `allow-scripts`, CSS-only exfil paths (attribute selectors +
// `background-image`) are real, so we drop any token that fails this check.
function looksLikeSafeCssToken(value: string): boolean {
  if (value.includes("<") || value.includes(">")) return false;
  // Defense in depth — explicit substring check in case a sneaky encoding
  // bypasses the simpler bracket check above.
  if (/<\s*\/\s*style/i.test(value)) return false;
  return true;
}

function quoteFontStack(font: string | undefined): string | null {
  if (!font || font.trim().length === 0) return null;
  // If the AI returned a comma-separated stack, preserve it verbatim. If it's
  // a single family with spaces, wrap in quotes so it parses correctly.
  const trimmed = font.trim();
  if (!looksLikeSafeCssToken(trimmed)) return null;
  if (trimmed.includes(",")) return trimmed;
  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

function appendIf(
  target: Record<string, string>,
  name: string,
  value: string | undefined | null,
): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed.length === 0) return;
  if (!looksLikeSafeCssToken(name) || !looksLikeSafeCssToken(trimmed)) return;
  target[name] = trimmed;
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
    appendIf(tokens, "--ww-radius", dna.shapeLanguage.borderRadius);
  }
  if (looksLikeCssLength(dna.shapeLanguage.cardRadius)) {
    appendIf(tokens, "--ww-radius-card", dna.shapeLanguage.cardRadius);
  }
  if (looksLikeCssLength(dna.shapeLanguage.sectionRadius)) {
    appendIf(tokens, "--ww-radius-section", dna.shapeLanguage.sectionRadius);
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
