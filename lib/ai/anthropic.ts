import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../extractJson";
import {
  buildEditUserPrompt,
  buildGenerateUserPrompt,
  EDIT_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
} from "./prompts";
import type { EditHeroInput, GenerateHeroInput, HeroResult } from "./types";

const DEFAULT_MODEL =
  process.env.ANTHROPIC_DEFAULT_MODEL || "claude-sonnet-4-6";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server");
  }
  return new Anthropic({ apiKey });
}

// Forcing a tool call is the supported way to get guaranteed-structured JSON
// from Claude when assistant-message prefill isn't available on the model.
const HERO_TOOL = {
  name: "emit_hero",
  description: "Emit the generated wedding hero section as structured JSON.",
  input_schema: {
    type: "object" as const,
    properties: {
      sectionId: { type: "string" },
      sectionName: { type: "string" },
      html: { type: "string" },
      css: { type: "string" },
      designNotes: { type: "string" },
    },
    required: ["sectionId", "sectionName", "html", "css", "designNotes"],
  },
};

async function callMessages(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model,
    max_tokens: 16384,
    temperature: 0.85,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tools: [HERO_TOOL],
    tool_choice: { type: "tool", name: HERO_TOOL.name },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[anthropic raw]",
      "stop_reason=" + response.stop_reason,
      toolUse ? "tool_use received" : JSON.stringify(response.content).slice(0, 500),
    );
  }

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Anthropic response truncated at max_tokens — increase max_tokens or shorten the prompt",
    );
  }

  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Anthropic did not return the expected tool call");
  }

  return JSON.stringify(toolUse.input);
}

export async function callAnthropicHeroGenerator(
  input: GenerateHeroInput,
): Promise<HeroResult> {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const raw = await callMessages(
    model,
    GENERATE_SYSTEM_PROMPT,
    buildGenerateUserPrompt(input.intake),
  );
  return extractJson<HeroResult>(raw);
}

export async function callAnthropicHeroEditor(
  input: EditHeroInput,
): Promise<HeroResult> {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const raw = await callMessages(
    model,
    EDIT_SYSTEM_PROMPT,
    buildEditUserPrompt(input),
  );
  return extractJson<HeroResult>(raw);
}
