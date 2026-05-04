# VeeInvite POC — AI Wedding Hero Generator

A Next.js 15 (App Router) POC that generates a single premium wedding-website hero section using either OpenAI or Anthropic. The user fills an intake form, picks a provider, hits **Generate Hero**, sees the result rendered live in a sandboxed iframe, and can chat-edit the hero with follow-up instructions.

This is intentionally narrow: only the hero section, no DB, no auth, no RSVP, no publishing.

## Stack

- Next.js 15, App Router, TypeScript, React 19
- Tailwind CSS — for the editor UI **only** (the generated hero is plain HTML/CSS)
- iframe `srcdoc` for preview, sandboxed to `allow-same-origin` (no scripts run inside)
- Server-side AI calls via `/api/generate-hero` and `/api/edit-hero`
- No database — state lives in React + `localStorage`

## Setup

```bash
cp .env.example .env.local      # add OPENAI_API_KEY and/or ANTHROPIC_API_KEY
npm install
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Var | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required to use the OpenAI provider |
| `ANTHROPIC_API_KEY` | Required to use the Anthropic provider |
| `OPENAI_DEFAULT_MODEL` | Optional, defaults to `gpt-4o` |
| `ANTHROPIC_DEFAULT_MODEL` | Optional, defaults to `claude-sonnet-4-6` |

API keys are read **server-side only**. Routes run with `runtime = "nodejs"` and the keys never reach the browser bundle.

## How it works

```
app/
  page.tsx                  three-panel UI (intake / preview / chat)
  api/
    generate-hero/route.ts  POST — first generation
    edit-hero/route.ts      POST — chat-driven edits
lib/
  ai/
    types.ts                shared AIProvider, IntakeForm, HeroResult
    prompts.ts              system + user prompt builders
    openai.ts               callOpenAIHeroGenerator / Editor
    anthropic.ts            callAnthropicHeroGenerator / Editor
    index.ts                generateHero() / editHero() — provider dispatch
  buildPreview.ts           wraps AI HTML/CSS in the iframe shell
  defaults.ts               default form values + dropdown options
  extractJson.ts            tolerant JSON extractor (strips ```json fences)
  validateHero.ts           regex checks: scoping, no scripts, @media, etc.
  validateIntake.ts         server-side input validation
```

### Provider abstraction

The API routes never know which provider they're talking to. They call `generateHero({ provider, model, intake })` and the dispatcher in `lib/ai/index.ts` picks `openai.ts` or `anthropic.ts`. Both implementations have the same input/output shape and use the same prompts from `lib/ai/prompts.ts`.

### Hero contract

The AI must return strict JSON:

```json
{
  "sectionId": "hero_001",
  "sectionName": "...",
  "html": "<section class=\"ww-section hero_001\"> ... </section>",
  "css": ".hero_001 { ... } @media (max-width: 900px) { ... } @media (max-width: 640px) { ... }",
  "designNotes": "..."
}
```

`lib/validateHero.ts` enforces:

- HTML contains `hero_001` and `ww-section`, no `<script>`, no `onclick=` / inline `on*=` handlers
- CSS contains `.hero_001`, no `body {`, `html {`, `* {`, no `@import`
- CSS contains at least one `@media` rule

If validation fails, the API returns `{ success: false, message }` with HTTP 422 and the UI shows the error without updating the preview.

### Iframe shell

`lib/buildPreview.ts` builds a minimal HTML document — viewport meta, Google Fonts (Manrope, Noto Serif Gujarati, Rozha One, Playfair Display, Cormorant Garamond), a tiny reset, and the AI's CSS + HTML injected. The iframe is sandboxed with only `allow-same-origin`, so any stray script in the AI output cannot execute.

## Acceptance criteria coverage

| # | Criterion | Where |
| --- | --- | --- |
| 1 | User can select OpenAI or Anthropic from UI | `app/page.tsx` IntakePanel — provider buttons |
| 2 | Generate Hero calls the selected provider | `app/api/generate-hero/route.ts` → `lib/ai/index.ts` dispatch |
| 3 | AI returns hero HTML/CSS JSON | `lib/extractJson.ts` parses; `lib/ai/prompts.ts` enforces format |
| 4 | Hero renders in iframe | `app/page.tsx` PreviewPanel + `lib/buildPreview.ts` |
| 5 | User can chat to modify hero | ChatPanel in `app/page.tsx` |
| 6 | Chat edit calls same selected provider | `/api/edit-hero` uses the same dispatch |
| 7 | Updated hero renders in iframe | `useEffect` in PreviewPanel updates `srcdoc` |
| 8 | CSS is scoped and validated | `lib/validateHero.ts` |
| 9 | Mobile/desktop preview toggle works | DeviceToggle — mobile = 390px wide, desktop = 100% |
| 10 | Download HTML works | `onDownloadHtml` in `app/page.tsx` |
| 11 | Version history restore works | VersionStrip — click any `vN` to restore |
| 12 | No API key is exposed in frontend | All AI calls happen in `app/api/*` (Node runtime) |

## Notes & limitations

- The iframe sandbox uses `allow-same-origin` only. We don't allow scripts because the validator already strips them — this is defense in depth.
- LocalStorage is best-effort. If the user clears it, the form resets to defaults; the hero state goes with it.
- This POC only covers the hero. The architecture (provider dispatch + scoped section validation) is designed so that adding other sections later is mostly a matter of new prompts and new validators.
