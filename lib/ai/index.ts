import {
  callAnthropicHeroEditor,
  callAnthropicHeroGenerator,
} from "./anthropic";
import { callOpenAIHeroEditor, callOpenAIHeroGenerator } from "./openai";
import type {
  EditHeroInput,
  GenerateHeroInput,
  HeroResult,
} from "./types";

// Single entry points the API routes use. Switching providers is just a
// dispatch on input.provider — the rest of the app stays identical.

export async function generateHero(
  input: GenerateHeroInput,
): Promise<HeroResult> {
  if (input.provider === "openai") {
    return callOpenAIHeroGenerator(input);
  }
  if (input.provider === "anthropic") {
    return callAnthropicHeroGenerator(input);
  }
  throw new Error(`Unsupported provider: ${String(input.provider)}`);
}

export async function editHero(input: EditHeroInput): Promise<HeroResult> {
  if (input.provider === "openai") {
    return callOpenAIHeroEditor(input);
  }
  if (input.provider === "anthropic") {
    return callAnthropicHeroEditor(input);
  }
  throw new Error(`Unsupported provider: ${String(input.provider)}`);
}

export type { EditHeroInput, GenerateHeroInput, HeroResult } from "./types";
