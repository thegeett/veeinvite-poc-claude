import type { EditScope, SiteDesignDNA } from "../design-dna/types";
import type { HeroResult, IntakeForm } from "./types";

// ---------- Design DNA extraction ----------

export const EXTRACT_DNA_SYSTEM_PROMPT = `You are a senior brand system designer for AI-generated wedding websites.

Analyze the generated Hero section and extract a reusable Site Design DNA. This DNA will guide future AI-generated sections so they feel like the same wedding website, but not copied.

Return strict JSON only. Do not generate HTML. Do not generate CSS blocks. Generate only the SiteDesignDNA object.

The DNA should describe the visual system behind the Hero:
- concept
- tone
- community
- style direction
- color palette
- typography personality
- border radius style
- card/surface style
- shadow depth
- cultural motifs
- animation mood
- spacing/shape rhythm
- texture/background treatment
- what future sections must preserve
- what future sections must avoid

Future sections should feel like the next chapter of the same wedding website, not a random new design.

Return JSON matching this exact TypeScript shape:

type SiteDesignDNA = {
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
};

Rules:
- Do not return markdown.
- Do not return prose outside JSON.
- All hex color values must be valid CSS hex strings.
- cssVariables keys must start with "--" (CSS custom property syntax).
- sectionRules must be short directives a future AI can follow (e.g. "Maintain the dark jewel-tone backdrop").`;

export function buildExtractDnaUserPrompt(
  intake: IntakeForm,
  hero: HeroResult,
): string {
  return [
    "Couple intake:",
    JSON.stringify(intake, null, 2),
    "",
    "Hero:",
    JSON.stringify(
      {
        sectionId: hero.sectionId,
        sectionName: hero.sectionName,
        html: hero.html,
        css: hero.css,
        designNotes: hero.designNotes,
      },
      null,
      2,
    ),
    "",
    "Return only the SiteDesignDNA JSON.",
  ].join("\n");
}

// ---------- Edit-request classifier ----------

export const CLASSIFY_EDIT_SYSTEM_PROMPT = `You are an AI product assistant for a wedding website design generator.

Your job is to classify the user's edit request.

There are three scopes:

1. content
Use this when the user only changes facts, wording, names, dates, venue, invitation text, translations, or typo fixes.
This should NOT update Site Design DNA.

2. section_style
Use this when the user changes only the current Hero section's appearance, spacing, typography, layout, decorative elements, or local style.
This should NOT update Site Design DNA unless the user clearly says the change should apply to the whole website or future sections.

3. global_design
Use this when the user asks to change the full website design direction, future sections, full theme, full color system, cultural/religious symbol strategy, or overall visual identity.
This SHOULD update Site Design DNA.

Return strict JSON only:
{
  "scope": "content" | "section_style" | "global_design",
  "shouldUpdateDNA": true | false,
  "reason": "short explanation"
}

Do not return markdown.
Do not return prose outside JSON.`;

export function buildClassifyEditUserPrompt(args: {
  intake: IntakeForm;
  currentHero: HeroResult;
  designDNA?: SiteDesignDNA | null;
  message: string;
}): string {
  const lines = [
    "User edit request:",
    args.message,
    "",
    "Current intake:",
    JSON.stringify(args.intake, null, 2),
    "",
    "Current Hero (for reference):",
    JSON.stringify(
      {
        sectionId: args.currentHero.sectionId,
        sectionName: args.currentHero.sectionName,
        designNotes: args.currentHero.designNotes,
      },
      null,
      2,
    ),
  ];

  if (args.designDNA) {
    lines.push(
      "",
      "Current Site Design DNA (summary):",
      JSON.stringify(
        {
          concept: args.designDNA.concept,
          tone: args.designDNA.tone,
          styleDirection: args.designDNA.styleDirection,
          paletteSummary: args.designDNA.palette,
          fonts: args.designDNA.fonts,
        },
        null,
        2,
      ),
    );
  } else {
    lines.push("", "Current Site Design DNA: none extracted yet.");
  }

  lines.push("", "Return only the classification JSON.");
  return lines.join("\n");
}

// ---------- Scope-aware addition for existing edit prompts ----------

export function scopeGuidanceForEditPrompt(scope: EditScope | undefined | null): string {
  switch (scope) {
    case "content":
      return [
        "Edit scope: CONTENT.",
        "- Only update relevant text/content the user asked to change.",
        "- Preserve existing design, CSS, layout, decorations, and visual identity unless changing them is unavoidable to honor the request.",
      ].join("\n");
    case "section_style":
      return [
        "Edit scope: SECTION_STYLE.",
        "- Update only the Hero's visual style, spacing, typography, or layout as requested.",
        "- Do not assume future sections should change.",
        "- Preserve overall Design DNA unless the user explicitly asked otherwise.",
      ].join("\n");
    case "global_design":
      return [
        "Edit scope: GLOBAL_DESIGN.",
        "- Update the Hero to reflect the user's new global visual direction.",
        "- The app will separately ask the user whether to refresh the Site Design DNA after this edit.",
        "- Still return only the updated Hero HTML/CSS in this response.",
      ].join("\n");
    default:
      return "";
  }
}
