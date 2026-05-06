# VeeInvite POC — context for Claude Code

A Next.js 15 (App Router) proof-of-concept that generates a single premium wedding-website hero section using either OpenAI or Anthropic. Single-user, local-only, no DB, no auth, no deployment target. The user (Geet) drives this hands-on; treat it as an interactive personal project, not a team codebase.

## Stack

- Next.js 15, App Router, TypeScript, React 19
- Tailwind CSS — for editor UI **only**. The generated hero is plain scoped HTML/CSS.
- Iframe `srcdoc` for live preview, sandboxed `allow-same-origin` (no `allow-scripts`).
- Server-side AI calls only — keys never reach the browser.
- File-system storage (no database). See "Disk layouts" below.

## Architectural map

| Area | Path |
| --- | --- |
| AI dispatcher (provider-agnostic entry points) | `lib/ai/index.ts` |
| Provider adapters | `lib/ai/anthropic.ts`, `lib/ai/openai.ts` |
| Hero generate + edit prompts | `lib/ai/prompts.ts` |
| DNA + classifier prompts | `lib/ai/dnaPrompts.ts` |
| Hero validator | `lib/validateHero.ts` |
| Intake/provider validators | `lib/validateIntake.ts` |
| Preview shell builder | `lib/buildPreview.ts` |
| Hero version disk store | `lib/versionsStore.ts` |
| **Design DNA layer** | `lib/design-dna/` (types, helpers, store, validator) |
| Routes | `app/api/{generate-hero,edit-hero,versions,extract-design-dna,classify-edit-request,design-dna}/route.ts` |
| Main UI | `app/page.tsx` (single-file, includes inline panel components) |
| Docs | `README.md`, `docs/design-dna.md` |

## Provider defaults

- OpenAI: `gpt-5.5` (set via `OPENAI_DEFAULT_MODEL` in `.env.local`).
- Anthropic: `claude-sonnet-4-6` (hardcoded fallback at `lib/ai/anthropic.ts:11-12`; `ANTHROPIC_DEFAULT_MODEL` is commented out in `.env.local`).

**Cost rule:** keep Sonnet 4.6, do not proactively suggest 4.7+ upgrades for this project. The user explicitly chose 4.6 to control spend on this POC. (Also recorded in persistent memory as `feedback_model_cost.md`.)

## Provider quirks worth knowing

- OpenAI hero generate/edit/classify use **strict structured outputs** (`response_format: { type: "json_schema", strict: true }`).
- OpenAI **DNA extraction** uses `json_object` mode because `SiteDesignDNA` has free-form `Record<string, string>` fields that strict mode cannot represent. The route + `callOpenAIExtractDesignDNA` validate the shape via `assertSiteDesignDNA` to compensate.
- Anthropic uses **forced tool use** (`tool_choice: { type: "tool", name: ... }`) for all four operations. Generic helper: `callWithForcedTool<T>` in `lib/ai/anthropic.ts`.
- GPT-5 family does **not** accept `temperature` (only default 1.0) or `max_tokens` — must use `max_completion_tokens`. Both are reflected in `lib/ai/openai.ts`.

## Disk layouts

Hero versions:
```
all_generated_version/
├── anthropic/
│   └── v<n>/        # metadata.json, hero.html, system_prompt.txt, user_prompt.txt
└── openai/
    └── v<n>/
```

Design DNA versions:
```
all_generated_design_dna/
└── v<n>/            # metadata.json, design_dna.json, tokens.css
```

Both stores use atomic `mkdir({ recursive: false })` + EEXIST retry to avoid concurrent collisions on the same `v<n>` dir.

## How to work with the user

- **Always ask before code edits.** Treat suggestions/questions ("what about X?", "Option A and B?") as the user weighing options, not as authorization. Authorization comes from explicit imperatives: *do it*, *apply it*, *go ahead*. (Recorded in persistent memory as `feedback_confirm_before_edit.md`.)
- For substantial multi-file work, the established pattern is: create a branch → implement fully → ask before push.
- Open PRs are reviewed inline; reply to each review thread with a position (agree / partial pushback) plus the planned fix before applying changes.
- The user runs the dev server themselves (`npm run dev`). Restart needed only after `.env.local` changes; code reloads via Next hot reload.

## Conventions

- Hero CSS uses BEM-style top-level scoping: `.hero_001__name`, `.hero_001__diya-body`, etc. **Not** descendant nesting (`.hero_001 .name`). The validator at `lib/validateHero.ts` accepts top-level scoping that includes `.hero_001` somewhere; the boundary regexes use `(^|[\s{},])` rather than `\b` so `.hero_001__diya-body` doesn't false-positive on the body-selector check.
- Class names must not contain the substrings `body` or `html` per the system prompt (rule 4a) — adopted to avoid even the rare false-positive on the global-style validator.
- All AI structured output goes through `lib/extractJson.ts` for parser robustness; with structured outputs / forced tool use, this is mostly a formality but kept for safety.

## Current state (as of feature/design-dna)

- Hero generation + chat-edit + version history shipped.
- **Site Design DNA layer shipped** on `feature/design-dna` (PR #2). Full doc in `docs/design-dna.md`. Review feedback addressed in commit `262c7fb`. Awaiting re-review at https://github.com/thegeett/veeinvite-poc-claude/pull/2.
- Edit-classification (content / section_style / global_design) gates DNA refresh notices. Notices come from chat (`global_design_edit`) or intake-change watcher (`intake_change`); only chat-driven notices block the watcher.

## Next planned task

**Screenshot QA + AI visual review** — sequenced as a follow-up branch after PR #2 merges. Spec covers:

- Playwright runner over the iframe HTML at three viewports (mobile/tablet/desktop).
- Deterministic checks (overflow, hero-exists, title visible, height bounds, tap-target sizes, failed images, console errors).
- AI visual review of screenshots → structured issue report (no code emitted).
- User-approval gate before any auto-fix; fix prompt then re-runs QA once.

Do **not** implement screenshot QA until the user explicitly asks; the spec exists in conversation context and via prior message history but isn't documented in-tree.

## Useful commands

```bash
npm run dev                           # local server
npx tsc --noEmit                      # type check only
gh pr view 2                          # current PR
gh api repos/thegeett/veeinvite-poc-claude/pulls/2/comments  # inline reviews
```

## Sensitive

`.env.local` holds real API keys; treat as never-share. `.env.example` should only ever contain placeholders / empty values. If a key ever ends up in conversation, flag and recommend rotation immediately.
