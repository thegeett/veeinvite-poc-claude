import type { SiteDesignDNA } from "./types";

const ALLOWED_INTENSITY = new Set(["none", "subtle", "medium", "rich"]);

export interface DnaValidationResult {
  ok: boolean;
  errors: string[];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Mirrors Anthropic's DNA_TOOL.input_schema so OpenAI (json_object mode) cannot
// produce a SiteDesignDNA shape that Anthropic would reject. Used by the
// route handler and by `callOpenAIExtractDesignDNA` before returning.
export function validateSiteDesignDNA(value: unknown): DnaValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, errors: ["designDNA must be an object."] };
  }

  const v = value as Record<string, unknown>;

  for (const key of [
    "concept",
    "tone",
    "community",
    "styleDirection",
    "shadowStyle",
    "layoutPersonality",
  ]) {
    if (!isString(v[key])) errors.push(`designDNA.${key} must be a string.`);
  }

  // palette
  if (!isPlainObject(v.palette)) {
    errors.push("designDNA.palette must be an object.");
  } else {
    const p = v.palette;
    if (!isString(p.primary)) errors.push("designDNA.palette.primary must be a string.");
    if (!isString(p.accent)) errors.push("designDNA.palette.accent must be a string.");
    if (!isString(p.background)) errors.push("designDNA.palette.background must be a string.");
    if (p.custom !== undefined && !isPlainObject(p.custom)) {
      errors.push("designDNA.palette.custom, if present, must be an object.");
    }
  }

  // fonts
  if (!isPlainObject(v.fonts)) {
    errors.push("designDNA.fonts must be an object.");
  } else {
    if (!isString(v.fonts.heading)) errors.push("designDNA.fonts.heading must be a string.");
    if (!isString(v.fonts.body)) errors.push("designDNA.fonts.body must be a string.");
  }

  // shapeLanguage
  if (!isPlainObject(v.shapeLanguage)) {
    errors.push("designDNA.shapeLanguage must be an object.");
  } else {
    const s = v.shapeLanguage;
    if (!isString(s.borderRadius)) errors.push("designDNA.shapeLanguage.borderRadius must be a string.");
    if (!isString(s.cardRadius)) errors.push("designDNA.shapeLanguage.cardRadius must be a string.");
    if (!isStringArray(s.preferredShapes)) {
      errors.push("designDNA.shapeLanguage.preferredShapes must be an array of strings.");
    }
  }

  // visualMotifs / sectionRules
  if (!isStringArray(v.visualMotifs)) {
    errors.push("designDNA.visualMotifs must be an array of strings.");
  }
  if (!isStringArray(v.sectionRules)) {
    errors.push("designDNA.sectionRules must be an array of strings.");
  }

  // animationMood
  if (!isPlainObject(v.animationMood)) {
    errors.push("designDNA.animationMood must be an object.");
  } else {
    const a = v.animationMood;
    if (!isString(a.intensity) || !ALLOWED_INTENSITY.has(a.intensity)) {
      errors.push(
        `designDNA.animationMood.intensity must be one of: ${Array.from(ALLOWED_INTENSITY).join(", ")}.`,
      );
    }
    if (!isStringArray(a.preferredAnimations)) {
      errors.push("designDNA.animationMood.preferredAnimations must be an array of strings.");
    }
  }

  // cssVariables — keys are free-form but must be string→string.
  if (!isPlainObject(v.cssVariables)) {
    errors.push("designDNA.cssVariables must be an object.");
  } else {
    for (const [key, val] of Object.entries(v.cssVariables)) {
      if (!isString(val)) {
        errors.push(`designDNA.cssVariables[${key}] must be a string.`);
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertSiteDesignDNA(value: unknown): SiteDesignDNA {
  const result = validateSiteDesignDNA(value);
  if (!result.ok) {
    throw new Error(`Invalid SiteDesignDNA: ${result.errors.join(" ")}`);
  }
  return value as SiteDesignDNA;
}
