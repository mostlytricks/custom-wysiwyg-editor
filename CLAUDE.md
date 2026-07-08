# custom-wysiwyg-editor

A custom WYSIWYG editor library: framework-free core, React/Next.js bindings,
Markdown/HTML export, Notion-style UI layer.

## Plan first

**Read `docs/PLAN.md` before starting work.** It is the single source of truth
for phases, status, architecture invariants, and the gravity (`ai-workspace`)
integration contract. When you complete or change scoped work, update the
checkboxes there in the same commit.

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
