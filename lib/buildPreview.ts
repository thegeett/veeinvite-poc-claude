import type { HeroResult } from "./ai/types";

interface BuildPreviewArgs {
  hero: HeroResult | null;
  designTokenCss?: string;
}

// The iframe shell — base reset, viewport meta, Google Fonts preconnects, the
// optional global design-token CSS (from Site Design DNA), and the AI-generated
// hero HTML/CSS injected on top. The AI controls only the content inside
// .hero_001; the surrounding shell is fixed.
export function buildPreviewHtml(args: BuildPreviewArgs): string {
  const { hero, designTokenCss } = args;
  const css = hero?.css ?? "";
  const html =
    hero?.html ??
    `<section class="ww-section hero_001"><div style="padding:48px;font-family:ui-sans-serif,system-ui;color:#666">No hero generated yet.</div></section>`;

  const tokenBlock =
    designTokenCss && designTokenCss.trim().length > 0
      ? `\n    ${designTokenCss}\n`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Noto+Serif+Gujarati:wght@400;600;700&family=Rozha+One&family=Playfair+Display:wght@600;700;800&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; min-height: 100%; }
    body { overflow-x: hidden; }
    .ww-section { width: 100%; position: relative; isolation: isolate; }
${tokenBlock}    ${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;
}
