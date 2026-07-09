# Changelog

All notable changes to **custom-wysiwyg-editor** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version source of truth
is the git tag `vX.Y.Z` + the root `package.json` `version` (never prose) — see
`CLAUDE.md` → **Releasing** for the cut procedure (or run `/cut-release
custom-wysiwyg-editor` from the workspace).

> Pre-1.0 on purpose — the model/API may still change (until 1.0.0: breaking → minor,
> feature/fix → patch). The five workspace packages version in lockstep with the root.

## [Unreleased]

### Added
- **HTML & Markdown import.** `parseHTML(html)` in core — the inverse of the
  view/HTML exporter (headings, lists, todos, quotes, code, dividers, callouts,
  tables incl. column alignment, styled spans back to marks; unknown elements
  flatten, loose inline runs become paragraphs). **Rich paste**: clipboard
  `text/html` now becomes real blocks via the new `insertBlocks` command
  (single paragraphs splice inline keeping marks; multi-block payloads split
  the current block; cell walls hold — plain text stays the fallback). New
  `@custom-wysiwyg/import-markdown` package: `parseMarkdown` for the GFM
  subset the exporter emits (round-trip tested); inline HTML degrades to
  plain text.
- **Phase 4 completed**: `selectBlock` command + **Esc block selection** (Esc
  selects the caret's block subtree, repeated Esc walks up to the parent, cell
  walls respected; the gutter handle reuses it) and **table chrome** — a
  `TableMenu` widget showing +Row/+Col/−Row/−Col/✕ while the caret is inside a
  table (plus a `<TableMenu>` React wrapper).
- **Block chrome** (Phase 4). Hover gutter on every top-level block: `+` inserts
  a paragraph below with the slash menu pre-opened; `⠿` drags to reorder (HTML5
  DnD with a drop indicator; drops before/after by pointer midpoint) and clicks
  to select the whole block subtree. New `moveBlock(from, to, side)` command
  moves a block with its subtree, rejecting no-op, into-own-subtree, and
  table-structure moves. New `BlockGutter` widget in `@custom-wysiwyg/ui` +
  `<BlockGutter>` React wrapper. Slash menu now matches `h1`/`h2`/`h3` queries.


## [0.2.0] - 2026-07-09

### Added
- **Tables** (Phase 3). `table` → `tableRow` → `tableCell` as ordinary tree
  nodes, so paths, selection mapping, and marks work unchanged. First row is the
  header. Cell walls: structural edits never cross a cell boundary (cross-cell
  ranges no-op; Backspace at cell start and after a table never merges); block
  conversions skip table structure. Tab/Shift+Tab navigate row-major and Enter
  moves down — both grow the table at the edge. Commands: `insertTable`,
  `addTableRow`/`addTableColumn`, `deleteTableRow`/`deleteTableColumn`,
  `deleteTable`; `setAlign` in a cell sets the **column** alignment
  (`table.attrs.columnAligns`). Slash item "Table". Export: GFM tables with pipe
  escaping and `:-:`/`--:` markers; HTML `thead/th` + `tbody/td` with per-column
  `text-align`.
- **To-dos, blockquotes, code blocks, dividers, callouts** (Phase 2 complete).
  Five new block types: `todo` (checkbox rendered as a real `<input>` — adds no
  text nodes; click toggles via the model; splits start unchecked; GFM `- [ ]`
  export), `quote` (`>` export incl. children), `codeBlock` (verbatim: marks and
  input rules are inert inside, Enter inserts `\n`, double-Enter on a trailing
  empty line exits; fenced Markdown with language, fence grows past inner
  backticks), `divider` (void block: text can't enter it, Backspace removes it;
  `---`/`<hr>`), and `callout` (emoji attr, `<aside>` in HTML, emoji-quote in
  Markdown). Input rules `[] `, `[x] `, `> `, ``` ``` ``` + space, `--- `; slash
  items for all five; empty todo/quote/callout exit to paragraph on Enter, and
  Backspace at block start strips chrome before merging.
- **Text color, highlight, and font size** (formatting domain). Three new valued
  marks — `color { value }`, `highlight { value }`, `fontSize { value: 'small' |
  'large' | 'huge' }` (token-based; `FONT_SIZES` owns the mapping). New command
  semantics for valued marks: `applyMark` **replaces** a same-type mark (never
  toggles off), `removeMark(type)` removes explicitly; editor commands
  `setColor`/`setHighlight`/`setFontSize` take `value | null`. Bubble menu gains a
  palette (text colors, highlights, sizes, resets). HTML export composes one
  `<span style>` per styled run (values escaped); Markdown falls back to inline
  spans, or drops styling with `{ styledText: 'plain' }`. New
  `.gravity/formatting/` domain owns the styling contract.
- **Bulleted & numbered lists** (Phase 2). New `listItem` block type
  (`attrs.kind: 'bullet' | 'ordered'`, Notion-style: no wrapper list node — a list is a
  run of same-kind siblings; nesting is the block tree). Commands
  `setList`/`toggleList`/`indentListItem`/`outdentListItem` (+ on `editor.commands`);
  Tab/Shift+Tab indent/outdent; input rules `- `, `* `, `1. `; Enter on an empty item
  and Backspace at item start exit the list (outdent when nested, else paragraph);
  slash-menu items "Bulleted list"/"Numbered list". Rendering: `data-list` +
  render-time `data-ordinal` with CSS-only markers. Exporters: HTML groups runs into
  `<ul>/<ol>` with nested lists inside `<li>`; Markdown emits tight lists with
  CommonMark content-column indentation and per-run `1..n` numbering.

### Changed
- **BREAKING — recursive block tree (Phase 2 groundwork).** The document model is now a
  tree: a block's inline spans moved from `children` to **`content`**, and `children`
  is an optional array of nested `BlockNode`s. Positions are path-based:
  `{ block: number, offset }` → **`{ path: number[], offset }`** (`[0]` = first
  top-level block, `[0, 1]` = its second child). All commands, selection mapping
  (`data-block` → `data-path` in the rendered DOM), input rules, ui widgets, and both
  exporters operate on the tree; new path helpers (`blockAt`, `comparePaths`,
  `blockEntries`, `replaceBlockAt`, …) are exported from `@custom-wysiwyg/core`.
  Editing behavior over flat documents is unchanged (all v0.1.0 tests pass translated;
  real-browser smoke green). Exporter tree semantics are provisional until list types
  land: HTML nests children in `<div class="cwe-children">`, Markdown flattens them to
  sibling blocks.

## [0.1.0] - 2026-07-08

### Added
- **Phase 0 — walking skeleton.** Monorepo (`core` / `ui` / `react` / `export-markdown` /
  `export-html`); JSON document model (paragraphs, headings h1–h3, bold/italic/code/link
  marks, block alignment); editing via pure commands (typing, Enter, cross-block
  Backspace/Delete, plain-text paste, undo/redo with typing coalescing, IME composition,
  stored marks); deterministic Markdown + HTML export; React bindings (`useEditor` /
  `<Editor>`, SSR-safe, `'use client'` baked in); CI + vanilla demo + Chromium smoke tests.
- **Phase 1 — Notion feel.** Slash menu (`/` palette), bubble toolbar with active states,
  Markdown input rules (`# `→h1–h3, `**bold**`, `*italic*`, `` `code` ``), placeholder
  text, editor event system (`change`/`update`/`focus`/`blur`); `@custom-wysiwyg/ui` stays
  framework-free with React wrappers.
- **`.gravity/` doc system (v1.8).** Roadmap + status spine in
  `.gravity/IMPLEMENTATION_PLAN.md`; evidence-tagged engine contract in
  `.gravity/core/SPEC.md`; the agent-adapter seam in `.gravity/integration/PLAN.md`
  (corrected: gravity is the doc system, not an AI runtime — the editor-side `transact`
  contract is the real seam); protocol card, router `CLAUDE.md`, `AGENTS.md` shim,
  `CONTEXT.md`.

### Known gaps
- Link button uses `window.prompt`; undo after autoformat doesn't restore literal `**`
  syntax; no HTML/Markdown import yet.
