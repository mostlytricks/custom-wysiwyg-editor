# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-09

## Completed
- **Phase 4 complete.** `selectBlock` command + Esc block selection (escalating,
  cell-wall aware); `TableMenu` caret-in-table toolbar over the row/column
  commands; gutter handle-click now reuses `selectBlock`. Gate green: 153/153
  (3 new); browser smoke 94/94 across eight suites (10 new). Phases 0-4 all done.
- **v0.2.0 cut** (`release: v0.2.0` on the branch; tag exists locally — the git
  proxy rejects tag pushes (403), so tag `5bbf7dc` as v0.2.0 and push from a
  local clone after merge).
- **Phase 4 first slice: block chrome shipped.** `BlockGutter` widget (hover
  `+`/`⠿`), `moveBlock` command with guards, HTML5 drag-reorder with drop
  indicator, handle-click block selection; `+` pre-opens the slash menu; slash
  matches h1/h2/h3. Gate green: 150/150 (4 new); browser smoke 84/84 across
  seven suites (7 new). Remaining Phase 4: full block-selection mode (Esc,
  multi-block), table hover chrome.

## Current State
- 5-package monorepo. **Phases 0-4 done**: full block set (through tables) + styling
  marks + slash/bubble/gutter/table-menu UI + Esc block selection, all exporting to
  Markdown (GFM) + HTML.
- Table v1 walls (no merges, inline-only cells, select-all stops at tables) are
  documented in `core/SPEC.md` Gotchas.
- Known polish debt unchanged: link button uses `window.prompt`; undo after autoformat
  doesn't restore literal `**` syntax; no HTML/Markdown import yet.

## Next Step
- Pick the next arc: **HTML/Markdown import** (the biggest compatibility gap:
  rich paste + loading saved content) or the **gravity agent adapter**
  (`integration/PLAN.md` — round-trip smoke, then a real agent driving
  `transact`). Formatting track also has open slices (font family, custom
  colors). Consider cutting v0.3.0 once one of these lands.
