# SPEC — core (the engine)

Compact agent contract for `packages/core` — the JSON document model, pure commands,
contenteditable view, input rules, and events. Read this before changing anything
under `packages/core/src/`. No `ARCHITECTURE.html` yet; the root `CLAUDE.md` Layout
section is the file map.

**Gate:** `npm run typecheck && npm test` — strict tsc across all packages + vitest
(`packages/*/test`, DOM via happy-dom). For editing/UI behavior changes this is
**necessary but not sufficient**: contenteditable bugs (async `selectionchange`, IME,
real key events) don't reproduce in happy-dom — also run the Playwright/Chromium smoke
against `examples/vanilla/index.html` after `npm run build` `[review]`.

<!-- Enforcement legend:
     [type]      tsc rejects it   [test:name]  a named test asserts it
     [review]    a human reviewer is the only check (said honestly)   [—] guidance -->

## Minimal Shape — a new command

```ts
// packages/core/src/commands.ts — a command is a pure function on EditorState:
export function myCommand(/* args */): (state: EditorState) => EditorState | null {
  return (state) => {
    // read state.doc + state.selection; build a NEW doc via the span/position helpers
    // (sliceSpans / normalizeSpans / clampPosition); never mutate, never touch the DOM.
    if (/* command doesn't apply */) return null
    return { ...state, doc: newDoc, selection: newSelection }
  }
}
```

## Generate

1. Copy the **Minimal Shape**; compose existing helpers from `model/` before writing new ones.
2. Satisfy every **Rule** + the **Behavioral Contract** below; add a `commands.test.ts` case per new behavior.
3. Run the **Gate** → green; for anything the user *feels* (selection, IME, keys), run the browser smoke too.

## Rules

- `[type]` A command is `(EditorState) => EditorState | null` — `null` means "doesn't apply", never a partial state.
- `[review]` **The DOM is never the source of truth.** Read content only from the model; from the DOM read *selection positions only*. No test asserts this — reviewer must catch it.
- `[review]` **Core stays zero-dependency and framework-free.** Nothing React/framework-shaped lands in `packages/core`; adapters live in `packages/react` / `packages/ui`.
- `[review]` External actors (toolbars, agents, collab) enter through `editor.transact()` — the same door as keystrokes. `setDoc()` is for loading only (it resets history).
- `[review]` New packages must be wired in **both** `tsconfig.base.json` aliases and `vitest.config.ts`, and appended to the ordered root `build` script — missing one fails confusingly late.
- `[—]` Streaming producers buffer into block-sized `transact` calls (see `../integration/PLAN.md`).

## Behavioral Contract

All asserted in `packages/core/test/commands.test.ts`:

- given a range selection, when `toggleMark` runs twice → the second toggle removes the mark `[test:toggleMark]`
- given a caret at the very start of the document, when `deleteBackward` runs → the command returns `null` (no-op, not a crash) `[test:deleteBackward]`
- given a caret at the end of a heading, when the block splits → the new block is a **paragraph** (heading doesn't leak downward) `[test:splitBlock]`
- given a cross-block range, when text is inserted or deleted → the endpoint blocks merge into one `[test:insertText]`
- given a collapsed selection with stored marks, when the next insert happens → the stored marks apply `[test:toggleMark]`

## Gotchas

- Selection state can be stale immediately after fast key sequences (real bug: Ctrl+B
  right after Shift+Home) — happy-dom never shows this; only the browser smoke does.
- Phase 2 (block tree, path-based positions) rewrites the Minimal Shape's position
  types — update this SPEC in the same slice, or it starts lying.
