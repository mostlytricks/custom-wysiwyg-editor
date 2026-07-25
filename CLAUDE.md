# custom-wysiwyg-editor

A custom WYSIWYG editor library: framework-free core, React/Next.js bindings,
Markdown/HTML export, Notion-style UI layer.

<!-- gravity:router v3.2 — managed by /adopt-gravity + /sync-gravity; do not hand-edit inside the fences -->
> **gravity: v3.2** — docs live in `.gravity/`. Before working here, read `.gravity/GRAVITY.md`
> (the protocol: doc kinds + rates, navigation discipline) and `.gravity/ROUTER.md` (the Doc Map +
> what to read before changing what). Session ritual: read `CONTEXT.md` first; update it before stopping.
<!-- /gravity:router -->

> **Protocol card: read `.gravity/GRAVITY.md` before touching `.gravity/` docs.** It embeds the project-side gravity protocol (doc kinds + rates, navigation discipline, SPEC anatomy) so this repo is self-describing even when opened without the workspace. It's a versioned copy — never hand-edit; re-copy from the workspace on a gravity upgrade.

## Commands

```bash
npm install          # workspace deps
npm run build        # tsup, runs packages in dependency order (core → ui → exporters → import → agent-adapter → react)
npm test             # vitest: packages/*/test (DOM tests via happy-dom)
npm run typecheck    # strict tsc across all packages
```

## Layout

- `packages/core` — engine: JSON document model, pure commands, contenteditable view, input rules, events. Zero deps, framework-free.
- `packages/ui` — framework-free DOM widgets (BubbleMenu, SlashMenu).
- `packages/react` — React bindings + wrappers. `'use client'` is added by tsup banner.
- `packages/export-markdown`, `packages/export-html` — serializers (model in, string out; no DOM).
- `packages/import-markdown` — Markdown → model parser (the GFM subset the exporter emits). HTML → model lives in core (`parse/html.ts`, powers rich paste).
- `packages/agent-adapter` — the agent seam: markdown context out, undoable markdown/block/stream edits in (see `.gravity/integration/PLAN.md`).
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
(all workspace packages bump in lockstep — **including the `@custom-wysiwyg/*`
dependency ranges** (`^X.Y.Z`), which are real ranges because npm publishes them
literally; changesets was considered and not adopted — lockstep + this procedure
covers it). Changes accumulate in `CHANGELOG.md` `[Unreleased]`. To cut: run
`/cut-release custom-wysiwyg-editor` from the workspace — it proposes the bump
from the `[Unreleased]` evidence (pre-1.0: breaking → minor, feature/fix →
patch), runs the gate (`npm run typecheck && npm test`; refuses to tag red
code), renames the changelog section with the real date, bumps the manifests,
commits `release: vX.Y.Z`, tags, and **stops before push** — the push is yours.
Pushing the tag triggers `.github/workflows/publish.yml`, which re-runs the
gate and publishes every package to npm with provenance (needs the `NPM_TOKEN`
repo secret; npm scope `custom-wysiwyg` was unclaimed as of 2026-07 — create
the org before the first publish).
