import OpenAI from "openai";
import { extractJson } from "../extractJson";
import {
  buildEditUserPrompt,
  buildGenerateUserPrompt,
  EDIT_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
} from "./prompts";
import type { EditHeroInput, GenerateHeroInput, HeroResult } from "./types";

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
