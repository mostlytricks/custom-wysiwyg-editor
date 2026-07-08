# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-09

## Completed
- **`v0.1.0` published** — pushed `main` + tag to `github.com/mostlytricks/custom-wysiwyg-editor`.
- **Phase 2 groundwork: recursive block tree shipped** (first two Phase 2 checkboxes).
  Model: inline spans → `content`, nested blocks → optional `children`; positions →
  `{ path: number[], offset }`; new `model/path.ts` helpers. Rewrote commands (cross-depth
  delete hoists survivors; split moves children to the new block), view (`data-path`,
  children render outside the content element), input rules, ui widgets, both exporters
  (tree semantics provisional until lists). Gate green (typecheck + 70/70, incl. 10 new
  tree tests); real-browser smoke 13/13 (typing, input rules, Shift+Home+Ctrl+B, undo/redo,
  merge, slash menu, live exports). `core/SPEC.md` updated same-slice; changelog has the
  BREAKING entry.

## Current State
- 5-package monorepo; Phases 0–1 done, Phase 2 checkboxes 1–2 done (tree + paths), rest of
  Phase 2 (lists, todos, quotes, code blocks, dividers, callouts) not started.
- No UI produces nesting yet — tree semantics (hoisting, split-children, exporter nesting)
  are provisional Notion-ish defaults to revisit when list types land (noted in SPEC Gotchas).
- Known polish debt unchanged: link button uses `window.prompt`; undo after autoformat
  doesn't restore literal `**` syntax.

## Next Step
- **Phase 2, checkbox 3: bulleted/numbered lists** — new block types on the tree
  (Tab/Shift+Tab indent via child nesting, input rules `- ` / `1. `), then extend
  slash menu + exporters (real list indent semantics replace the provisional flattening).
  Read `.gravity/core/SPEC.md` first.
