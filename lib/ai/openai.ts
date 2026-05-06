import OpenAI from "openai";
import type { EditClassification, SiteDesignDNA } from "../design-dna/types";
import { assertSiteDesignDNA } from "../design-dna/validateSiteDesignDNA";
import { extractJson } from "../extractJson";
import {
  buildClassifyEditUserPrompt,
  buildExtractDnaUserPrompt,
  CLASSIFY_EDIT_SYSTEM_PROMPT,
  EXTRACT_DNA_SYSTEM_PROMPT,
} from "./dnaPrompts";
import {
  buildEditUserPrompt,
  buildGenerateUserPrompt,
  EDIT_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
} from "./prompts";
import type {
  ClassifyEditInput,
  EditHeroInput,
  ExtractDesignDnaInput,
  GenerateHeroInput,
  HeroResult,
} from "./types";

const DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || "gpt-4o";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set on the server");
  }
  return new OpenAI({ apiKey });
}

// Token-level constraint via OpenAI Structured Outputs. The model can only
// emit responses that satisfy this schema — no missing fields, no shape drift.
const HERO_SCHEMA = {
  type: "object",
  properties: {
    sectionId: { type: "string" },
    sectionName: { type: "string" },
    html: { type: "string" },
    css: { type: "string" },
    designNotes: { type: "string" },
  },
  required: ["sectionId", "sectionName", "html", "css", "designNotes"],
  additionalProperties: false,
} as const;

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    scope: {
      type: "string",
      enum: ["content", "section_style", "global_design"],
    },
    shouldUpdateDNA: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["scope", "shouldUpdateDNA", "reason"],
  additionalProperties: false,
} as const;

async function callChat(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "hero",
        strict: true,
        schema: HERO_SCHEMA,
      },
    },
    max_completion_tokens: 16384,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }
  return content;
}

// DNA extraction uses json_object mode rather than strict structured outputs:
// SiteDesignDNA contains free-form Record<string, string> fields (cssVariables,
// palette.custom) which strict mode cannot represent — strict mode requires
// `additionalProperties: false` on every object. json_object mode plus a
// detailed prompt + server-side validation is the practical compromise.
async function callChatJsonObject(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }
  return content;
}

async function callChatStrict<T>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  schemaName: string,
  schema: unknown,
  maxTokens: number,
): Promise<T> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema: schema as Record<string, unknown>,
      },
    },
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }
  return JSON.parse(content) as T;
}

export async function callOpenAIHeroGenerator(
  input: GenerateHeroInput,
): Promise<HeroResult> {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const raw = await callChat(
    model,
    GENERATE_SYSTEM_PROMPT,
    buildGenerateUserPrompt(input.intake),
  );
  return extractJson<HeroResult>(raw);
}

export async function callOpenAIHeroEditor(
  input: EditHeroInput,
): Promise<HeroResult> {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const raw = await callChat(
    model,
    EDIT_SYSTEM_PROMPT,
    buildEditUserPrompt(input),
  );
  return extractJson<HeroResult>(raw);
}

export async function callOpenAIExtractDesignDNA(
  input: ExtractDesignDnaInput,
): Promise<SiteDesignDNA> {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const raw = await callChatJsonObject(
    model,
    EXTRACT_DNA_SYSTEM_PROMPT,
    buildExtractDnaUserPrompt(input.intake, input.hero),
    8192,
  );
  // json_object mode does not enforce schema; mirror the Anthropic
  // forced-tool-use guarantee with an explicit validator. Mismatch throws
  // and is caught by the route as a normal AI-call failure.
  const parsed = extractJson<unknown>(raw);
  return assertSiteDesignDNA(parsed);
}

export async function callOpenAIClassifyEditRequest(
  input: ClassifyEditInput,
): Promise<EditClassification> {
  const model = input.model?.trim() || DEFAULT_MODEL;
  return callChatStrict<EditClassification>(
    model,
    CLASSIFY_EDIT_SYSTEM_PROMPT,
    buildClassifyEditUserPrompt({
      intake: input.intake,
      currentHero: input.currentHero,
      designDNA: input.designDNA,
      message: input.message,
    }),
    "edit_classification",
    CLASSIFY_SCHEMA,
    1024,
  );
}
