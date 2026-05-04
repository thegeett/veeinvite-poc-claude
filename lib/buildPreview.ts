import type { HeroResult } from "./ai/types";

// The iframe shell — base reset, viewport meta, Google Fonts preconnects,
// and the AI-generated HTML/CSS injected into it. The AI controls only
// the content inside .hero_001; the surrounding shell is fixed.
export function buildPreviewHtml(hero: HeroResult | null): string {
  const css = hero?.css ?? "";
  const html =
    hero?.html ??
    `<section class="ww-section hero_001"><div style="padding:48px;font-family:ui-sans-serif,system-ui;color:#666">No hero generated yet.</div></section>`;

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
    ${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;
}
