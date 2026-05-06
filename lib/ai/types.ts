// Shared types for the AI provider abstraction.
// Both the OpenAI and Anthropic implementations conform to these so the
// app code can stay provider-agnostic.

export type AIProvider = "openai" | "anthropic";

export interface IntakeForm {
  brideName: string;
  groomName: string;
  weddingDate: string;
  venue: string;
  location: string;
  community: string;
  styleDirection: string;
  mood: string;
  language: string;
  heroMessage: string;
  imageUrl?: string;
}

export interface HeroResult {
  sectionId: string;
  sectionName: string;
  html: string;
  css: string;
  designNotes: string;
}

export interface GenerateHeroInput {
  provider: AIProvider;
  model?: string;
  intake: IntakeForm;
}

export interface EditHeroInput {
  provider: AIProvider;
  model?: string;
  currentHero: Pick<HeroResult, "sectionId" | "html" | "css" | "designNotes">;
  message: string;
  intake: IntakeForm;
  // Optional scope from /api/classify-edit-request. When provided, the prompt
  // adapts so the AI knows whether the user expects a content tweak, a
  // local style change, or a global redesign.
  editScope?: import("../design-dna/types").EditScope;
}

export interface ExtractDesignDnaInput {
  provider: AIProvider;
  model?: string;
  intake: IntakeForm;
  hero: HeroResult;
}

export interface ClassifyEditInput {
  provider: AIProvider;
  model?: string;
  intake: IntakeForm;
  currentHero: HeroResult;
  designDNA?: import("../design-dna/types").SiteDesignDNA | null;
  message: string;
}
