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
| `core` | ◑ | engine (model/commands/view/input rules) — **tree + paths + bulleted/numbered lists shipped**; next: todos, quotes, code blocks, dividers, callouts. `core/SPEC.md` |
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
- [ ] To-do blocks (checkbox), blockquotes, code blocks, dividers, callouts
- [ ] Extend slash-menu items + exporters for each new type

## Phase 3 — Tables

- [ ] Table node (rows → cells → inline content)
- [ ] Cell-aware selection; Tab/arrow navigation; add/remove row & column UI
- [ ] Markdown export as GFM tables (column alignment via `:---:` — no HTML fallback needed)

## Phase 4 — Blocks as objects

- [ ] Hover gutter: `⠿` drag handle + `+` insert button
- [ ] Drag-and-drop block reordering (`moveBlock` command)
- [ ] Block-level selection mode (click handle / Esc)

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
