import Anthropic from "@anthropic-ai/sdk";
import type { EditClassification, SiteDesignDNA } from "../design-dna/types";
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

const DNA_TOOL = {
  name: "emit_design_dna",
  description:
    "Emit the extracted Site Design DNA as structured JSON. Do not emit HTML or CSS blocks — only the design system description.",
  input_schema: {
    type: "object" as const,
    properties: {
      concept: { type: "string" },
      tone: { type: "string" },
      community: { type: "string" },
      styleDirection: { type: "string" },
      palette: {
        type: "object",
        properties: {
          primary: { type: "string" },
          secondary: { type: "string" },
          accent: { type: "string" },
          background: { type: "string" },
          surface: { type: "string" },
          text: { type: "string" },
          mutedText: { type: "string" },
          gold: { type: "string" },
          green: { type: "string" },
          custom: { type: "object" },
        },
        required: ["primary", "accent", "background"],
      },
      fonts: {
        type: "object",
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
          accent: { type: "string" },
        },
        required: ["heading", "body"],
      },
      shapeLanguage: {
        type: "object",
        properties: {
          borderRadius: { type: "string" },
          cardRadius: { type: "string" },
          sectionRadius: { type: "string" },
          preferredShapes: { type: "array", items: { type: "string" } },
        },
        required: ["borderRadius", "cardRadius", "preferredShapes"],
      },
      visualMotifs: { type: "array", items: { type: "string" } },
      textureStyle: { type: "string" },
      shadowStyle: { type: "string" },
      animationMood: {
        type: "object",
        properties: {
          intensity: {
            type: "string",
            enum: ["none", "subtle", "medium", "rich"],
          },
          preferredAnimations: { type: "array", items: { type: "string" } },
        },
        required: ["intensity", "preferredAnimations"],
      },
      layoutPersonality: { type: "string" },
      sectionRules: { type: "array", items: { type: "string" } },
      cssVariables: { type: "object" },
    },
    required: [
      "concept",
      "tone",
      "community",
      "styleDirection",
      "palette",
      "fonts",
      "shapeLanguage",
      "visualMotifs",
      "shadowStyle",
      "animationMood",
      "layoutPersonality",
      "sectionRules",
      "cssVariables",
    ],
  },
};

const CLASSIFY_TOOL = {
  name: "emit_edit_classification",
  description: "Emit the classification of the user's edit request.",
  input_schema: {
    type: "object" as const,
    properties: {
      scope: {
        type: "string",
        enum: ["content", "section_style", "global_design"],
      },
      shouldUpdateDNA: { type: "boolean" },
      reason: { type: "string" },
    },
    required: ["scope", "shouldUpdateDNA", "reason"],
  },
};

interface ToolDef {
  name: string;
  description: string;
  input_schema: unknown;
}

async function callWithForcedTool<T>(
  model: string,
  tool: ToolDef,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<T> {
  const client = getClient();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature: 0.85,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tools: [tool] as unknown as Anthropic.Messages.Tool[],
    tool_choice: { type: "tool", name: tool.name },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[anthropic ${tool.name}]`,
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

  return toolUse.input as T;
}

async function callMessages(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const input = await callWithForcedTool<unknown>(
    model,
    HERO_TOOL,
    systemPrompt,
    userPrompt,
    16384,
  );
  return JSON.stringify(input);
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

export async function callAnthropicExtractDesignDNA(
  input: ExtractDesignDnaInput,
): Promise<SiteDesignDNA> {
  const model = input.model?.trim() || DEFAULT_MODEL;
  return callWithForcedTool<SiteDesignDNA>(
    model,
    DNA_TOOL,
    EXTRACT_DNA_SYSTEM_PROMPT,
    buildExtractDnaUserPrompt(input.intake, input.hero),
    8192,
  );
}

export async function callAnthropicClassifyEditRequest(
  input: ClassifyEditInput,
): Promise<EditClassification> {
  const model = input.model?.trim() || DEFAULT_MODEL;
  return callWithForcedTool<EditClassification>(
    model,
    CLASSIFY_TOOL,
    CLASSIFY_EDIT_SYSTEM_PROMPT,
    buildClassifyEditUserPrompt({
      intake: input.intake,
      currentHero: input.currentHero,
      designDNA: input.designDNA,
      message: input.message,
    }),
    1024,
  );
}
