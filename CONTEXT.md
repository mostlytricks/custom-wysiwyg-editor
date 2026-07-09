# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-09

## Completed
- **v0.2.1 cut** (patch: import + Phase 4 are features, no breaking — per the
  pre-1.0 rule). Tag pending owner push, same as v0.2.0: from a local clone,
  `git tag v0.2.1 <release-sha> && git push origin v0.2.1`.
- **HTML & Markdown import shipped** (the compatibility-gap arc). `parseHTML`
  in core + rich paste via `insertBlocks` (inline splice vs split-and-insert,
  cell walls hold, plain-text fallback); new `@custom-wysiwyg/import-markdown`
  package (6th) with `parseMarkdown` for the exported GFM subset; round-trip
  tests both ways (md→doc→md and doc→html→doc). Gate green: 172/172 (19 new);
  browser smoke 104/104 across nine suites (10 new: synthetic clipboard
  pastes, markdown load, undo). happy-dom lacks `:scope` — parser avoids it.
- **Phase 4 complete.** `selectBlock` command + Esc block selection (escalating,
  cell-wall aware); `TableMenu` caret-in-table toolbar over the row/column
  commands; gutter handle-click now reuses `selectBlock`. Gate green: 153/153
  (3 new); browser smoke 94/94 across eight suites (10 new). Phases 0-4 all done.
- **v0.2.0 cut** (`release: v0.2.0` on the branch; tag exists locally — the git
  proxy rejects tag pushes (403), so tag `5bbf7dc` as v0.2.0 and push from a
  local clone after merge).

## Current State
- 5-package monorepo. **Phases 0-4 done**: full block set (through tables) + styling
  marks + slash/bubble/gutter/table-menu UI + Esc block selection, all exporting to
  Markdown (GFM) + HTML.
- Table v1 walls (no merges, inline-only cells, select-all stops at tables) are
  documented in `core/SPEC.md` Gotchas.
- Known polish debt unchanged: link button uses `window.prompt`; undo after autoformat
  doesn't restore literal `**` syntax; no HTML/Markdown import yet.

## Next Step
- **Gravity agent adapter** (`integration/PLAN.md`): round-trip smoke from
  ai-workspace, then a real agent driving `transact` edits — importers now
  close the loop (agent returns Markdown → `parseMarkdown` → `insertBlocks`/
  `transact`). Or: formatting open slices (font family, custom colors), or
  cut v0.3.0 (import + Phase 4 are ready evidence).
