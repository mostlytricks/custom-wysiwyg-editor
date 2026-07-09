# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-09

## Completed
- **v0.2.0 cut** (`release: v0.2.0` on the branch; tag exists locally — the git
  proxy rejects tag pushes (403), so tag `5bbf7dc` as v0.2.0 and push from a
  local clone after merge).
- **Phase 4 first slice: block chrome shipped.** `BlockGutter` widget (hover
  `+`/`⠿`), `moveBlock` command with guards, HTML5 drag-reorder with drop
  indicator, handle-click block selection; `+` pre-opens the slash menu; slash
  matches h1/h2/h3. Gate green: 150/150 (4 new); browser smoke 84/84 across
  seven suites (7 new). Remaining Phase 4: full block-selection mode (Esc,
  multi-block), table hover chrome.
- **Phase 3 complete: tables shipped** (planned in `core/PLAN.tables.md`, outcome
  recorded there). Tables are ordinary tree nodes (table→row→cell) with cell-wall
  guards, Tab/Enter navigation that grows at the edge, row/column commands,
  column alignment on table attrs, GFM + thead/th export. Gate green: 146/146
  (14 new); browser smoke 77/77 across six suites (11 new). SPEC +3 contract
  rows + table gotchas; core spine stays ✓ (Phases 2–3 done).

## Current State
- 5-package monorepo. Phases 0-3 done: full block set (paragraphs, headings, lists,
  todos, quotes, code blocks, dividers, callouts, tables) + styling marks
  (color/highlight/fontSize) + slash/bubble UI, all exporting to Markdown (GFM) + HTML.
- Table v1 walls (no merges, inline-only cells, select-all stops at tables) are
  documented in `core/SPEC.md` Gotchas; table hover chrome deferred to Phase 4.
- Known polish debt unchanged: link button uses `window.prompt`; undo after autoformat
  doesn't restore literal `**` syntax; no HTML/Markdown import yet.

## Next Step
- **Finish Phase 4**: full block-selection mode (Esc enters it, arrow/multi-block
  selection, Backspace deletes whole blocks) + table hover chrome (add/remove
  row/column buttons on hover). Alternatives: HTML/Markdown import, or the
  gravity agent adapter (`integration/PLAN.md`).
