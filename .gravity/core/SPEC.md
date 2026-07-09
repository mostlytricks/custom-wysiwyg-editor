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
    // read state.doc + state.selection; build a NEW doc via the path/span helpers
    // (blockAt / replaceBlockAt / blockEntries from model/path; sliceSpans /
    // normalizeSpans / clampPosition); never mutate, never touch the DOM.
    if (/* command doesn't apply */) return null
    return { ...state, doc: newDoc, selection: newSelection }
  }
}
```

The doc is a **recursive block tree**: a block's own inline text lives in
`content: TextSpan[]`; nested blocks in optional `children: BlockNode[]`. A
`Position` is `{ path: number[], offset }` — the path indexes `children`
arrays from `doc.children` down; the offset counts characters across the
target block's `content` only (child blocks have their own paths). Document
order = lexicographic path order (parent before descendants); traverse with
`blockEntries` / `previousPath` / `nextPath`, never by hand.

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
- given a range spanning tree depths, when text is inserted or deleted → the endpoint blocks merge and surviving descendants hoist into the removed block's slot `[test:block tree]`
- given a caret at the start of a first child block, when `deleteBackward` runs → the child's text merges into its parent (and an *empty* parent is replaced by its hoisted children) `[test:block tree]`
- given a list item, when it indents → it becomes the last child of its previous sibling list item (with its own children); no previous list-item sibling → no-op `[test:lists]`
- given a nested list item with following siblings, when it outdents → it becomes the next sibling of its parent and adopts the following siblings as children (document order preserved) `[test:lists]`
- given an empty list item, when Enter runs → the item exits the list: outdent when nested, paragraph at top level; same on Backspace at item start (marker strips before any merge) `[test:lists]`
- given consecutive ordered siblings, when serialized → they number 1..n per run; a bullet or non-list block resets the count (`[test:lists]` in export tests; view mirrors via data-ordinal)
- given an empty todo/quote/callout, when Enter runs → the block exits to a paragraph; Backspace at the start of todo/quote/callout/codeBlock strips the chrome before any merge `[test:to-dos]` `[test:quotes and callouts]`
- given a code block, when marks are toggled or input rules would fire → nothing happens (verbatim content); Enter inserts '\n', double-Enter on a trailing empty line exits `[test:code blocks]`
- given a divider, when text would enter or split it → no-op; Backspace from the following block removes it `[test:dividers]`
- given a checked todo, when it splits → the new todo starts unchecked `[test:to-dos]`
- given endpoints in different table cells (or one inside, one outside), when a structural edit runs (insert/delete/split) → no-op; Backspace at cell start and in the block after a table never merges `[test:cell walls]`
- given a caret in a cell, when `setAlign` runs → the **column** aligns via `table.attrs.columnAligns` (GFM model) `[test:column alignment]`
- given a `moveBlock(from, to, side)`, when the target is the block itself, its descendant, or table structure → null; otherwise the block moves with its whole subtree `[test:moveBlock]`
- given `selectBlock`, when invoked at a caret → the block's subtree is selected; invoked again → escalates to the parent; inside a table it never crosses the cell wall `[test:selectBlock]`
- given the caret in a cell, when block conversions run (`setHeading`, …) → table/tableRow/tableCell are skipped `[test:cell walls]`

## Gotchas

- Selection state can be stale immediately after fast key sequences (real bug: Ctrl+B
  right after Shift+Home) — happy-dom never shows this; only the browser smoke does.
- Cross-depth deletes hoist surviving descendants into the removed block's slot
  (document order preserved); `splitBlock` moves nested children to the *new* block.
  Lists landed on these semantics unchanged and pinned the list-specific behaviors
  in the Behavioral Contract; the generic hoisting rows still say `[test:block tree]`.
- List markers are pure CSS (`::before` on `data-list`/`data-ordinal`) — a marker must
  never add DOM text nodes, or selection offset mapping breaks. Ordered ordinals are
  computed at render time per sibling run (`renderBlocks`), not stored in the model.
- Rendered blocks carry `data-path` ("0", "0.1"); a block's nested children render
  *outside* its data-path element (sibling `.cwe-children` wrapper), so collecting a
  block element's text nodes never leaks child-block text. Don't render child blocks
  inside the content element — selection mapping counts on this. **Exception:
  tables** render rows/cells inline (`<table>/<tr>/<th|td>`, all with data-path) —
  safe because table and row own no text of their own.
- Table v1 walls: no cell merges/spans, cells hold inline text only, and select-all
  + delete no-ops when the range would cross into a table (delete tables via
  `deleteTable` or a range strictly containing the table). First row is always the
  header. Enter/Tab in cells is *navigation* (editor layer), never splitting.
