// Site Design DNA — the global visual identity that guides future sections.
// Extracted once from the generated Hero, then reused so that every additional
// AI-generated section feels like another chapter of the same wedding website.

export interface SiteDesignDNA {
  concept: string;
  tone: string;
  community: string;
  styleDirection: string;

  palette: {
    primary: string;
    secondary?: string;
    accent: string;
    background: string;
    surface?: string;
    text?: string;
    mutedText?: string;
    gold?: string;
    green?: string;
    custom?: Record<string, string>;
  };

  fonts: {
    heading: string;
    body: string;
    accent?: string;
  };

  shapeLanguage: {
    borderRadius: string;
    cardRadius: string;
    sectionRadius?: string;
    preferredShapes: string[];
  };

  visualMotifs: string[];

  textureStyle?: string;

  shadowStyle: string;

  animationMood: {
    intensity: "none" | "subtle" | "medium" | "rich";
    preferredAnimations: string[];
  };

  layoutPersonality: string;

  sectionRules: string[];

  cssVariables: Record<string, string>;
}

export type EditScope = "content" | "section_style" | "global_design";

export interface EditClassification {
  scope: EditScope;
  shouldUpdateDNA: boolean;
  reason: string;
}

export type DesignDNAVersionSource =
  | "initial_generation"
  | "manual_refresh"
  | "global_design_edit"
  | "intake_change";

export interface DesignDNAVersion {
  id: string;
  label: string;
  createdAt: string;
  designDNA: SiteDesignDNA;
  source: DesignDNAVersionSource;
}
