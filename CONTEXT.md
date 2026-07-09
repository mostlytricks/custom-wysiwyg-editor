# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-09

## Completed
- **Phase 3 complete: tables shipped** (planned in `core/PLAN.tables.md`, outcome
  recorded there). Tables are ordinary tree nodes (table→row→cell) with cell-wall
  guards, Tab/Enter navigation that grows at the edge, row/column commands,
  column alignment on table attrs, GFM + thead/th export. Gate green: 146/146
  (14 new); browser smoke 77/77 across six suites (11 new). SPEC +3 contract
  rows + table gotchas; core spine stays ✓ (Phases 2–3 done).
- **Phase 2 complete: todo/quote/codeBlock/divider/callout shipped.** Five block
  types with Notion behaviors (checkbox click-to-toggle via real `<input>` —
  no text nodes; verbatim code blocks: marks+rules inert, Enter='\n',
  double-Enter exits; void dividers; emoji callouts). Input rules `[] `/`[x] `/
  `> `/fence/`--- `; slash items; exit-and-strip Enter/Backspace semantics;
  both exporters (GFM tasks, prefixed quotes, fences, `<hr>`, `<aside>`).
  Gate green: 132/132 (27 new); browser smoke 66/66 across five suites
  (16 new). SPEC Behavioral Contract +5 rows; status spine: core → ✓.

## Current State
- 5-package monorepo. Phases 0-3 done: full block set (paragraphs, headings, lists,
  todos, quotes, code blocks, dividers, callouts, tables) + styling marks
  (color/highlight/fontSize) + slash/bubble UI, all exporting to Markdown (GFM) + HTML.
- Table v1 walls (no merges, inline-only cells, select-all stops at tables) are
  documented in `core/SPEC.md` Gotchas; table hover chrome deferred to Phase 4.
- Known polish debt unchanged: link button uses `window.prompt`; undo after autoformat
  doesn't restore literal `**` syntax; no HTML/Markdown import yet.

## Next Step
- **Phase 4: blocks as objects** — hover gutter (`⠿` drag handle + `+` insert
  button), drag-and-drop reordering (`moveBlock` command), block-level selection
  mode. This is also where table hover chrome (add/remove row/col buttons) lands.
  Alternatives if preferred: HTML/Markdown import (compatibility gap) or the
  gravity agent adapter (`integration/PLAN.md`).
