import type { HeroResult } from "./ai/types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// Lightweight regex-based checks. We aren't trying to parse HTML/CSS —
// we're catching the categories of mistakes the spec calls out.
export function validateHero(hero: Partial<HeroResult> | null | undefined): ValidationResult {
  const errors: string[] = [];

  if (!hero || typeof hero !== "object") {
    return { ok: false, errors: ["Hero payload is missing or not an object."] };
  }

  const { html, css } = hero;

  if (typeof html !== "string" || html.length === 0) {
    errors.push("html field is missing or empty.");
  }
  if (typeof css !== "string" || css.length === 0) {
    errors.push("css field is missing or empty.");
  }

  if (typeof html === "string") {
    if (!html.includes("hero_001")) {
      errors.push('html must include the class "hero_001".');
    }
    if (!html.includes("ww-section")) {
      errors.push('html must include the class "ww-section".');
    }
    if (/<script/i.test(html)) {
      errors.push("html must not contain <script tags.");
    }
    if (/onclick=/i.test(html)) {
      errors.push("html must not contain inline onclick handlers.");
    }
    // Catch other inline event handlers as well — same intent as the rule.
    if (/\son[a-z]+=/i.test(html)) {
      errors.push("html must not contain inline event handlers (on*=).");
    }
  }

  if (typeof css === "string") {
    if (!css.includes(".hero_001")) {
      errors.push('css must include the ".hero_001" scope.');
    }
    // Use selector-boundary anchors (start-of-string or whitespace / {} / ,)
    // so legitimate scoped classes like `.hero_001__diya-body` don't trigger.
    if (/(^|[\s{},])body\s*\{/i.test(css)) {
      errors.push('css must not include "body {" (no global body styles).');
    }
    if (/(^|[\s{},])html\s*\{/i.test(css)) {
      errors.push('css must not include "html {" (no global html styles).');
    }
    if (/(^|[^.\w-])\*\s*\{/.test(css)) {
      errors.push('css must not include "* {" (no global universal styles).');
    }
    if (/@import/i.test(css)) {
      errors.push("css must not include @import.");
    }
    if (!/@media/i.test(css)) {
      errors.push("css must include at least one @media rule for responsiveness.");
    }
  }

  return { ok: errors.length === 0, errors };
}
