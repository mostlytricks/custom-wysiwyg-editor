# Implementation Plan — custom-wysiwyg-editor

The what/next roadmap: phases, status spine, and the arc. **Update checkboxes and the
spine whenever work lands.** Architecture invariants live in the root `CLAUDE.md`
(one concern, one home); the agent-integration contract lives in
`integration/PLAN.md`; *now* lives in the root `CONTEXT.md`.

## Vision

A custom WYSIWYG library built for **compatibility** — embeds on a plain website
with a `<script>` tag, first-class React/Next.js + TypeScript support, exports to
Markdown and HTML (including aligned text) — evolving toward a **Notion-like
editing experience**, with a clean **agent-integration seam** so external agents
(AI or otherwise) drive edits through the same pure-command door as keystrokes.

## Status spine

| Domain | Status | One line |
|---|---|---|
| `core` | ✓ | engine (model/commands/view/input rules) — **Phases 2–3 complete** (tree, paths, full block set incl. tables with GFM export); **Phases 2–4 complete**. `core/SPEC.md` |
| `formatting` | ◑ | text styling & alignment — bold/italic/code/link/align shipped; **color/highlight/fontSize marks + bubble palette shipped**; open: font family, block indent. `formatting/SPEC.md` |
| `integration` | ○ | the agent-adapter seam — editor-side contract shipped; adapter + round-trip smoke not started. `integration/PLAN.md` |
| ui | ✓ | framework-free widgets (BubbleMenu, SlashMenu) — no folder yet; mint when it grows rules |
| react | ✓ | bindings (`useEditor`/`<Editor>`, SSR-safe) — no folder yet |
| export | ✓ | markdown + html serializers — no folder yet; Phase 2/3 will touch both |

## Phase 0 — Walking skeleton ✅ (done)

- [x] Monorepo: core / react / export-markdown / export-html (+ ui added in Phase 1)
- [x] Document model: paragraphs, headings h1–h3, marks (bold/italic/code/link), block alignment
- [x] Editing: typing, Enter, Backspace/Delete with cross-block merge, plain-text paste, undo/redo with typing coalescing, IME composition, stored marks
- [x] Markdown + HTML export; aligned blocks fall back to inline HTML in Markdown
- [x] React bindings: `useEditor` / `<Editor>`, `'use client'` baked in, SSR-safe
- [x] CI (GitHub Actions), vanilla demo page, Chromium smoke tests

## Phase 1 — Notion feel ✅ (done)

- [x] Slash menu (`/` palette: filter, arrows, Enter, Esc; extensible items)
- [x] Bubble toolbar above selections with active states
- [x] Markdown input rules: `# `→h1…h3, `**bold**`, `*italic*`, `` `code` ``
- [x] Placeholder text; editor event system (`change`/`update`/`focus`/`blur`)
- [x] `@custom-wysiwyg/ui` is framework-free; React wrappers `<BubbleMenu>`/`<SlashMenu>`
- Known polish debt: link button uses `window.prompt`; undo after autoformat doesn't restore the literal `**` syntax

## Phase 2 — Structure (next up)

The one genuinely architectural step. Do this before adding more block types.
Rules to respect while doing it: `core/SPEC.md`.

- [x] Migrate model from flat block list to a **recursive block tree**; positions become paths (`{ path: number[], offset }`) — inline spans now `content`, nested blocks `children`
- [x] Update all commands + selection mapping (`data-path`) + both exporters for the tree (exporter nesting semantics provisional until list types define them)
- [x] Bulleted / numbered lists (`listItem` blocks with `kind`, Tab/Shift+Tab indent via tree nesting, input rules `- `/`* `/`1. `, Enter/Backspace exit-and-outdent, slash items, `<ul>/<ol>` grouping in HTML, tight indented Markdown lists)
- [x] To-do blocks (checkbox, click-to-toggle), blockquotes, code blocks (verbatim: no marks/rules, Enter = newline, double-Enter exits), dividers (void block), callouts (emoji attr)
- [x] Extend slash-menu items + exporters for each new type (GFM tasks, `>` quotes, fences, `---`, emoji-quote callouts; HTML: task `<ul>`, `<blockquote>`, `<pre><code>`, `<hr>`, `<aside>`)

## Phase 3 — Tables

- [x] Table node (rows → cells → inline content) — ordinary tree nodes, so paths/marks/selection work unchanged; cell walls guard structural edits
- [x] Cell-aware selection; Tab/Shift+Tab + Enter navigation (grow at the edge); add/remove row/column/table via commands (hover chrome deferred to Phase 4)
- [x] Markdown export as GFM tables (first row = header, pipe escaping, `:-:`/`--:` column alignment via `setAlign` in a cell); HTML `thead/th` + `tbody/td`

## Phase 4 — Blocks as objects ✅ (done)

- [x] Hover gutter: `⠿` drag handle + `+` insert button (inserts a paragraph below with the slash menu pre-opened)
- [x] Drag-and-drop block reordering (`moveBlock` command with subtree, guards vs no-op/descendant/table structure; HTML5 DnD + drop indicator)
- [x] Click the handle to select the whole block (subtree text selection)
- [x] Esc block selection: selects the caret block subtree, repeated Esc escalates to the parent; typing/Backspace act on the whole block; stops at cell walls (native Shift+Arrow already extends across blocks)
- [x] Table chrome: caret-in-table toolbar (`TableMenu` widget) with +Row/+Col/−Row/−Col/✕ over the existing commands

## Formatting track (`formatting/SPEC.md`)

- [x] Boolean marks (bold/italic/code) + link; block alignment incl. justify (Phases 0–1)
- [x] Valued style marks: **text color, highlight, font size** (token-based) — replace-not-toggle semantics, HTML `<span style>` export, Markdown inline-HTML fallback (`styledText: 'plain'` to drop), bubble-menu palette
- [ ] Font family (token set: default / serif / mono)
- [ ] Generic block indent for non-list blocks (decide vs. nesting before Phase 4)
- [ ] Custom color input in the palette

## Ongoing / parallel track

- [ ] HTML & Markdown **import** (rich paste, load saved content) — biggest compatibility gap
- [ ] **Agent adapter** (`integration/PLAN.md`) — round-trip smoke, then a real agent driving `transact` edits
- [ ] Publishing setup: npm scope, versioning (changesets), docs site
- [ ] Undo of input rules restores literal syntax; inline link editor
