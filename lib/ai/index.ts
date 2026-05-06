import type { EditClassification, SiteDesignDNA } from "../design-dna/types";
import {
  callAnthropicClassifyEditRequest,
  callAnthropicExtractDesignDNA,
  callAnthropicHeroEditor,
  callAnthropicHeroGenerator,
} from "./anthropic";
import {
  callOpenAIClassifyEditRequest,
  callOpenAIExtractDesignDNA,
  callOpenAIHeroEditor,
  callOpenAIHeroGenerator,
} from "./openai";
import type {
  ClassifyEditInput,
  EditHeroInput,
  ExtractDesignDnaInput,
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

export async function extractDesignDNA(
  input: ExtractDesignDnaInput,
): Promise<SiteDesignDNA> {
  if (input.provider === "openai") {
    return callOpenAIExtractDesignDNA(input);
  }
  if (input.provider === "anthropic") {
    return callAnthropicExtractDesignDNA(input);
  }
  throw new Error(`Unsupported provider: ${String(input.provider)}`);
}

export async function classifyEditRequest(
  input: ClassifyEditInput,
): Promise<EditClassification> {
  if (input.provider === "openai") {
    return callOpenAIClassifyEditRequest(input);
  }
  if (input.provider === "anthropic") {
    return callAnthropicClassifyEditRequest(input);
  }
  throw new Error(`Unsupported provider: ${String(input.provider)}`);
}

export type {
  ClassifyEditInput,
  EditHeroInput,
  ExtractDesignDnaInput,
  GenerateHeroInput,
  HeroResult,
} from "./types";
