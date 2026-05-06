# Site Design DNA

This document describes the Design DNA layer added on the `feature/design-dna` branch.

## What it is

Site Design DNA is the **global visual identity** of a generated wedding website. It is a structured description of the design system behind the Hero section — palette, fonts, motifs, shape language, animation mood, future-section rules — that downstream sections can read so they look like the same website.

DNA is **not the same as intake**:

| | Intake | Design DNA |
| --- | --- | --- |
| Holds | Wedding facts and content (names, date, venue, message) | Visual identity (colors, fonts, motifs, rules) |
| Updates | Whenever the user types | Deliberately, when design intent actually changes |
| Use | Feeds AI prompts as context | Drives the global token CSS injected into every preview |

The product rule: **DNA does not auto-update on every edit.** It updates only on (a) initial Hero generation, (b) a user-confirmed manual refresh, (c) after a chat edit classified as a global redesign, or (d) after intake fields that affect design semantics change and the user accepts the refresh.

## Edit classification

Every chat edit goes through `/api/classify-edit-request` first. The classifier returns one of three scopes:

| Scope | Examples | DNA refresh? |
| --- | --- | --- |
| `content` | Change bride name, fix typo, swap CTA text | No |
| `section_style` | Make couple name bigger, add a diya, more spacing | No |
| `global_design` | Make the whole site more royal, switch to ivory + emerald, remove all religious symbols | **Yes** — surfaces a non-blocking notice |

The classification's `scope` is forwarded to `/api/edit-hero`, where the user prompt prepends scope-specific guidance so the AI knows whether to preserve design (content), preserve DNA (section_style), or shift direction (global_design).

If the classifier call fails (network, parse, AI error), the route falls back to:

```json
{ "scope": "section_style", "shouldUpdateDNA": false, "reason": "Classifier failed, defaulted to local section edit." }
```

The user's edit is **never** blocked by classifier failure.

## Intake-change handling

A deterministic helper (`shouldRefreshDNAForIntakeChange`) compares the live intake to the snapshot taken at the last DNA extraction (`intakeAtDnaExtraction`). It triggers a notice when **design-affecting fields** change, not factual ones:

| Triggers DNA notice | Doesn't |
| --- | --- |
| `community` | `brideName` |
| `styleDirection` | `groomName` |
| `mood` | `weddingDate` |
| `language` | `venue` |
| Adding/removing the hero `imageUrl` | `location` |
| | `heroMessage` |

When a notice is shown, the user can either **Refresh Design DNA** (calls extract, saves a new version) or **Keep existing DNA** (treats the current intake as the new baseline so the same change doesn't re-fire the notice).

Notice priority: a `global_design_edit` notice from chat blocks the intake-change watcher from overriding it. Once the user accepts/dismisses, the watcher takes over.

## Storage

DNA versions are written to disk, mirroring the hero version layout.

```
all_generated_design_dna/
├── .gitkeep
├── v1/
│   ├── metadata.json    # full record (id, label, createdAt, source, designDNA, provider, model)
│   ├── design_dna.json  # bare SiteDesignDNA object — handy for tooling/import
│   └── tokens.css       # generated :root { --ww-color-primary: ...; } block
├── v2/
│   └── …
```

- IDs are sequential (`dna_v1`, `dna_v2`, …).
- The full `StoredDnaVersion` (with provider/model audit) lives in `metadata.json`.
- `tokens.css` is also written so non-app consumers (downstream sections, copy/paste, design tools) can grab the token block without parsing JSON.

The browser's `localStorage` only keeps `intakeAtDnaExtraction` (a per-tab UI baseline). DNA + version history come from disk on every page load.

## Token injection pipeline

`buildPreviewHtml` accepts `{ hero, designTokenCss? }` and assembles the iframe shell as:

```
1. base reset (* { box-sizing: border-box; }, html/body margins, .ww-section)
2. global DNA token CSS    ← from buildGlobalDesignTokenCss(designDNA)
3. current Hero CSS
```

`buildGlobalDesignTokenCss` emits canonical tokens from palette / fonts / shape-language fields, then merges the DNA's free-form `cssVariables` map on top so it can override or extend.

Canonical tokens emitted (when corresponding DNA fields exist):

| Token | Source |
| --- | --- |
| `--ww-color-primary` | `palette.primary` |
| `--ww-color-secondary` | `palette.secondary` |
| `--ww-color-accent` | `palette.accent` |
| `--ww-color-background` | `palette.background` |
| `--ww-color-surface` | `palette.surface` |
| `--ww-color-text` | `palette.text` |
| `--ww-color-muted-text` | `palette.mutedText` |
| `--ww-color-gold` | `palette.gold` |
| `--ww-color-green` | `palette.green` |
| `--ww-font-heading` | `fonts.heading` |
| `--ww-font-body` | `fonts.body` |
| `--ww-font-accent` | `fonts.accent` |
| `--ww-radius` | `shapeLanguage.borderRadius` (only if it looks like a CSS length) |
| `--ww-radius-card` | `shapeLanguage.cardRadius` |
| `--ww-radius-section` | `shapeLanguage.sectionRadius` |

Plus everything in `dna.palette.custom` (prefixed with `--ww-color-` if not already a CSS custom property name) and everything in `dna.cssVariables` (verbatim, last-wins on conflict).

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/extract-design-dna` | Run the AI extractor and return a `SiteDesignDNA` object. Does **not** save — caller decides whether to push to history. |
| `POST` | `/api/classify-edit-request` | Classify a chat edit. Returns `{ scope, shouldUpdateDNA, reason }`. Falls back to a safe default on AI/network failure. |
| `GET` | `/api/design-dna` | List saved DNA versions from `all_generated_design_dna/`. |
| `POST` | `/api/design-dna` | Save a new DNA version (writes `metadata.json`, `design_dna.json`, `tokens.css`). |

All routes run on the Node runtime so `fs` is available.

## Provider plumbing

Both providers gained two new methods, dispatched via `lib/ai/index.ts`:

- `extractDesignDNA(input)` → `Promise<SiteDesignDNA>`
- `classifyEditRequest(input)` → `Promise<EditClassification>`

Provider-specific implementations:

| | OpenAI | Anthropic |
| --- | --- | --- |
| Hero generate | Structured Outputs (strict json_schema) | Forced tool use |
| Hero edit | Structured Outputs | Forced tool use |
| **DNA extract** | `json_object` mode (DNA shape includes free-form `Record<string,string>` fields that strict mode can't represent) | Forced tool use with permissive `{ type: "object" }` for free-form fields |
| **Classify edit** | Structured Outputs (small fixed shape, fits strict mode) | Forced tool use |

Both providers reuse the same prompt strings from `lib/ai/dnaPrompts.ts`.

## UI

The right column splits vertically into two panels:

```
┌──────────────────┐
│  Site Design DNA │ ← top
│  (notice banner) │
│  concept · tone  │
│  palette swatches│
│  fonts · motifs  │
│  version history │
├──────────────────┤
│   Chat editor    │ ← bottom
└──────────────────┘
```

- **Refresh DNA** button — re-extracts from current Hero. Records a `manual_refresh` version.
- **Notice banner** — appears when (a) a chat edit is classified `global_design`, or (b) intake fields that affect design change. Two buttons: Refresh Design DNA / Keep existing DNA.
- **DNA history list** — every version with a Restore button. Restore changes only `designDNA` (and therefore the injected tokens), **not** the Hero HTML/CSS.

## Version sources

Each saved DNA version records why it was created:

| `source` | When |
| --- | --- |
| `initial_generation` | Auto-extracted right after the first Hero generation |
| `manual_refresh` | User clicked Refresh DNA without an active notice |
| `global_design_edit` | User clicked Refresh on a notice raised by a `global_design` chat edit |
| `intake_change` | User clicked Refresh on a notice raised by a design-affecting intake change |

## Files added

| Path | Purpose |
| --- | --- |
| `lib/design-dna/types.ts` | `SiteDesignDNA`, `EditScope`, `EditClassification`, `DesignDNAVersion`, `DesignDNAVersionSource` |
| `lib/design-dna/buildGlobalDesignTokenCss.ts` | Canonical tokens + `cssVariables` merge |
| `lib/design-dna/shouldRefreshDNAForIntakeChange.ts` | Deterministic intake-diff helper |
| `lib/design-dna/dnaStore.ts` | `listDnaVersions`, `saveDnaVersion` — disk I/O |
| `lib/ai/dnaPrompts.ts` | Extract + classifier system/user prompts; `scopeGuidanceForEditPrompt` |
| `app/api/extract-design-dna/route.ts` | DNA extraction endpoint |
| `app/api/classify-edit-request/route.ts` | Edit classifier endpoint |
| `app/api/design-dna/route.ts` | List/save DNA versions |
| `all_generated_design_dna/` | Disk root for DNA version artifacts |

## Files modified

| Path | Change |
| --- | --- |
| `lib/ai/types.ts` | Added `ExtractDesignDnaInput`, `ClassifyEditInput`; extended `EditHeroInput.editScope` |
| `lib/ai/anthropic.ts` | Refactored to a generic `callWithForcedTool<T>`; added `DNA_TOOL` and `CLASSIFY_TOOL` schemas plus the two new methods |
| `lib/ai/openai.ts` | Added `callOpenAIExtractDesignDNA` (json_object mode) and `callOpenAIClassifyEditRequest` (strict structured outputs) |
| `lib/ai/index.ts` | Added `extractDesignDNA` and `classifyEditRequest` dispatchers |
| `lib/ai/prompts.ts` | `buildEditUserPrompt` reads `input.editScope` and prepends `scopeGuidanceForEditPrompt` |
| `lib/buildPreview.ts` | Accepts `{ hero, designTokenCss? }`; positional `HeroResult` still works for back-compat |
| `app/api/edit-hero/route.ts` | Accepts `editScope` in body, passes through to `editHero` |
| `app/page.tsx` | DNA state + hydration from server, auto-extract after generate, classify-then-edit flow, intake-change watcher, refresh/dismiss/restore handlers, new `DesignDnaPanel` + `DnaSummary` components, right-column vertical split |

## Acceptance criteria coverage

| Criterion | Status |
| --- | --- |
| Chat edits classified before edit | ✓ |
| Content edits don't trigger DNA refresh notice | ✓ |
| Local style edits don't trigger DNA refresh notice | ✓ |
| Global edits trigger DNA refresh notice | ✓ |
| Design-affecting intake changes trigger notice | ✓ |
| Factual intake changes don't trigger notice | ✓ |
| Refresh DNA button works | ✓ |
| Version history works | ✓ (disk-backed) |
| Restoring older DNA works (without changing Hero HTML/CSS) | ✓ |
| Hero generation/editing still works for both providers | ✓ |
| No API keys exposed to frontend | ✓ |
| No database required | ✓ (file-system storage only) |

## What's intentionally not done

- **No screenshot QA / AI visual review.** Sequenced for a follow-up branch.
- **No DNA-driven future sections.** DNA exists and emits tokens; consumer sections are out of scope for this change.
- **No DNA delete endpoint.** Versions accumulate. To wipe, delete files in `all_generated_design_dna/` manually.
- **No DNA export to a separate JSON file at project root.** Each version's `design_dna.json` is the canonical export point.
