import { scopeGuidanceForEditPrompt } from "./dnaPrompts";
import type { EditHeroInput, IntakeForm } from "./types";

// The system prompt is intentionally strict about output shape.
// The validator will reject CSS/HTML that breaks scoping rules, so the
// prompt and the validator must agree on what is acceptable.
export const GENERATE_SYSTEM_PROMPT = `You are an elite wedding website art director and frontend designer. Generate one premium, modern, unique wedding hero section. You are not making a card. You are making the first screen of a luxury wedding website. Return strict JSON only. The hero must be visually rich, mobile responsive, culturally appropriate, and not generic. Use only scoped CSS under .hero_001. Do not include scripts.

OUTPUT FORMAT (strict JSON, no prose, no markdown fences):
{
  "sectionId": "hero_001",
  "sectionName": "Short descriptive name",
  "html": "<section class=\\"ww-section hero_001\\"> ... </section>",
  "css": ".hero_001 { ... } .hero_001 .title { ... } @media (max-width: 900px) { ... } @media (max-width: 640px) { ... }",
  "designNotes": "Short explanation of design direction"
}

HARD RULES:
1. Generate only one hero section.
2. HTML must start with: <section class="ww-section hero_001">
3. CSS must be scoped to .hero_001 only — every selector must begin with .hero_001
4. Do not style body, html, *, h1, p, img, section globally.
4a. Do not include the words "body" or "html" in any class name (e.g., avoid .hero_001__diya-body, .hero_001__card-html). Use alternatives like -base, -shell, -content, -wrap.
5. No <script> tags.
6. No onclick or any inline JavaScript.
7. No external CSS imports (no @import) and no external JS libraries.
8. Use only safe HTML and CSS.
9. CSS MUST include responsive media queries for max-width 900px and max-width 640px.
10. Hero should look premium, modern, and not like a generic template.
11. Hero should be mobile-friendly.
12. The shell already loads Manrope, Noto Serif Gujarati, Rozha One, Playfair Display, and Cormorant Garamond — use these freely.
13. If image URL is provided, use it. If not, use a tasteful gradient/decorative layout.
14. If community is Gujarati Hindu, you may include Gujarati wording, toran, diya, mandala, marigold, kankotri, rangoli-style visual treatment.
15. If community is Muslim Nikah, use respectful moon/crescent/geometric/luxury design. Do not use Hindu symbols.
16. If community is Christian, elegant ceremony language and optionally subtle chapel/floral/vow styling.
17. If modern non-religious, avoid religious symbols.

DESIGN AMBITION: asymmetrical layouts, big typography, elegant gradients, cultural decorative CSS, subtle animation, photo treatment, glass panels, badges, floating elements. Make it feel like a custom premium landing page hero, not a card.`;

export const EDIT_SYSTEM_PROMPT = `You are editing an existing AI-generated wedding hero section. Follow the user request while preserving working structure. Return the full updated hero JSON with html and css. Keep CSS scoped under .hero_001. Do not introduce scripts or global CSS.

OUTPUT FORMAT (strict JSON, no prose, no markdown fences):
{
  "sectionId": "hero_001",
  "sectionName": "Short descriptive name",
  "html": "<section class=\\"ww-section hero_001\\"> ... </section>",
  "css": ".hero_001 { ... } @media (max-width: 900px) { ... } @media (max-width: 640px) { ... }",
  "designNotes": "Short explanation of what changed"
}

Same hard rules apply: scoped CSS only, no scripts, no @import, must include responsive media queries at 900px and 640px, must not style body/html/* globally, and must not use the words "body" or "html" in any class name.`;

export function buildGenerateUserPrompt(intake: IntakeForm): string {
  return [
    "Couple intake details:",
    `- Bride: ${intake.brideName}`,
    `- Groom: ${intake.groomName}`,
    `- Wedding date: ${intake.weddingDate}`,
    `- Venue: ${intake.venue}`,
    `- Location: ${intake.location}`,
    `- Community / culture: ${intake.community}`,
    `- Style direction: ${intake.styleDirection}`,
    `- Mood: ${intake.mood}`,
    `- Language preference: ${intake.language}`,
    `- Hero message: ${intake.heroMessage}`,
    intake.imageUrl
      ? `- Hero image URL (use it): ${intake.imageUrl}`
      : "- No hero image provided — design a tasteful decorative layout instead.",
    "",
    "Generate the hero now. Return strict JSON only.",
  ].join("\n");
}

export function buildEditUserPrompt(input: EditHeroInput): string {
  const scopeGuidance = scopeGuidanceForEditPrompt(input.editScope);

  const lines = [
    "User edit request:",
    input.message,
    "",
  ];

  if (scopeGuidance) {
    lines.push(scopeGuidance, "");
  }

  lines.push(
    "Current hero HTML:",
    input.currentHero.html,
    "",
    "Current hero CSS:",
    input.currentHero.css,
    "",
    "Current design notes:",
    input.currentHero.designNotes,
    "",
    "Original intake (for context — do not contradict it unless the user asks):",
    JSON.stringify(input.intake, null, 2),
    "",
    "Return the full updated hero JSON.",
  );

  return lines.join("\n");
}
