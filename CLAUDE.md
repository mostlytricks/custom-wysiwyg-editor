# custom-wysiwyg-editor

A custom WYSIWYG editor library: framework-free core, React/Next.js bindings,
Markdown/HTML export, Notion-style UI layer.

> **gravity: v1.8** · _the version of the workspace gravity system this project adopted (workspace root `VERSION` / `CHANGELOG.md`). Bump when you re-sync to a newer skeleton; `/triage` flags drift._

> **Docs live in `.gravity/`.** This `CLAUDE.md` (identity, *how*) and `CONTEXT.md` (*now*) stay at the project root and auto-load; `README.md` is the user guide. Everything else — the *what/next* and the contracts — is organized **by subject domain** under `.gravity/`. See the **Doc Map** below. One concern, one home — link, don't restate.

> **Protocol card: read `.gravity/GRAVITY.md` before touching `.gravity/` docs.** It embeds the project-side gravity protocol (doc kinds + rates, navigation discipline, SPEC anatomy) so this repo is self-describing even when opened without the workspace. It's a versioned copy — never hand-edit; re-copy from the workspace on a gravity upgrade.

## Doc Map (`.gravity/`)

Docs are grouped by **subject domain**, not by doc-type. A domain folder holds whichever of three kinds it needs — `ARCHITECTURE.html` (human deep-dive), `SPEC.md` (agent contract), `PLAN.*.md` (what/next) — named by *kind* because the folder already names the subject. **Recognized only when present.**

```
.gravity/
  GRAVITY.md                # the protocol card — how to work these docs (versioned copy, never hand-edit)
  IMPLEMENTATION_PLAN.md    # what/next — vision, phase roadmap, per-domain status spine
  core/         SPEC.md     # engine contract: pure commands, model-is-truth, the walls
  integration/  PLAN.md     # the agent-adapter seam: editor-side contract + round-trip milestone
```

No `MISSION.html` / `ARCHITECTURE.html` yet (vision lives in IMPLEMENTATION_PLAN; the Layout below is the file map). `ui` / `react` / `export` earn folders when they grow rules worth a SPEC.

## What to read before a change (router)

| If you're changing… | Read first |
|---|---|
| `packages/core` (model, commands, view, input rules, events) | `.gravity/core/SPEC.md` |
| Agent/external-actor editing, `transact` semantics, adapter work | `.gravity/integration/PLAN.md`, then `core/SPEC.md` |
| Phases / what's next / status | `.gravity/IMPLEMENTATION_PLAN.md` |
| `packages/ui`, `packages/react`, exporters | this file's Layout + Architecture rules (no SPEC yet) |

When you complete or change scoped work, update the checkboxes + status spine in `.gravity/IMPLEMENTATION_PLAN.md` in the same commit, and refresh `CONTEXT.md` at session end.

## Adding a domain (start here for a new feature)

Gate first — *is it a domain?* (own principle, rules worth a SPEC, a multi-step arc). If not, it's a `PLAN.*.md` slice under an existing domain. Mint with `/new-domain custom-wysiwyg-editor <domain>` from the workspace (it wires the Doc Map, router table, and status spine so nothing is orphaned); details in `.gravity/GRAVITY.md`.

## Commands

```bash
npm install          # workspace deps
npm run build        # tsup, runs packages in dependency order (core → ui → exporters → react)
npm test             # vitest: packages/*/test (DOM tests via happy-dom)
npm run typecheck    # strict tsc across all packages
```

## Layout

- `packages/core` — engine: JSON document model, pure commands, contenteditable view, input rules, events. Zero deps, framework-free.
- `packages/ui` — framework-free DOM widgets (BubbleMenu, SlashMenu).
- `packages/react` — React bindings + wrappers. `'use client'` is added by tsup banner.
- `packages/export-markdown`, `packages/export-html` — serializers (model in, string out; no DOM).
- `examples/vanilla/index.html` — demo used by the Playwright smoke tests (loads `dist/*.global.js`, so build first).

## Architecture rules

- The JSON model is the source of truth; the DOM is only a view. Never read content back from the DOM (only selection positions).
- All edits are pure commands `(EditorState) => EditorState | null`. External actors use `editor.transact()`; `setDoc()` is for loading only (resets history).
- Core and ui stay dependency-free and framework-free; anything React-specific goes in `packages/react`.
- Workspace packages resolve via aliases in `tsconfig.base.json` **and** `vitest.config.ts` — add new packages to both, and to the ordered root `build` script.

## Verification

Unit tests are not sufficient for contenteditable behavior (async
`selectionchange`, IME, real key events). For editing/UI changes, also run a
real-browser check: Playwright + system Chromium against
`examples/vanilla/index.html` after `npm run build`. Past real bugs caught this
way: stale selection on Ctrl+B right after Shift+Home.

## Releasing

Version source of truth: the git tag `vX.Y.Z` + the root `package.json` `version`
(the five workspace packages bump in lockstep). Changes accumulate in
`CHANGELOG.md` `[Unreleased]`. To cut: run `/cut-release custom-wysiwyg-editor`
from the workspace — it proposes the bump from the `[Unreleased]` evidence
(pre-1.0: breaking → minor, feature/fix → patch), runs the gate
(`npm run typecheck && npm test`; refuses to tag red code), renames the changelog
section with the real date, bumps the manifests, commits `release: vX.Y.Z`, tags,
and **stops before push** — the push is yours.
