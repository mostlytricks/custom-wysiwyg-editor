# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-09

## Completed
- **Phase 2 groundwork: recursive block tree shipped** (checkboxes 1–2; see git history
  for the full slice description).
- **Phase 2, checkbox 3: bulleted/numbered lists shipped.** `listItem` block type
  (`kind: bullet | ordered`, no wrapper node — runs of same-kind siblings; nesting =
  the tree). Commands set/toggle/indent/outdent + Tab/Shift+Tab; input rules `- `/`* `/
  `1. `; Enter-on-empty & Backspace-at-start exit the list (outdent when nested); slash
  items; CSS-only markers (`data-list`, render-time `data-ordinal`); HTML export groups
  `<ul>/<ol>` (nested lists inside `<li>`), Markdown emits tight indented lists with
  per-run numbering. Fixed `setAlign` dropping required attrs on list items ([type] wall
  caught it). Gate green: typecheck + 94/94 (24 new); browser smoke 40/40 across three
  suites (13 new list checks: input rules, Tab/Shift+Tab, exit behaviors, ordinals,
  undo, slash, live exports). SPEC Behavioral Contract gained 4 `[test:lists]` rows.

## Current State
- 5-package monorepo; Phases 0–1 done; Phase 2: tree + paths + lists done, remaining:
  todos, quotes, code blocks, dividers, callouts (checkboxes 4–5).
- Tree semantics (hoisting, split-children) survived the list slice unchanged and are
  now partially pinned by `[test:lists]` rows; generic-nesting Markdown still flattens.
- Known polish debt unchanged: link button uses `window.prompt`; undo after autoformat
  doesn't restore literal `**` syntax.

## Next Step
- **Phase 2, checkbox 4: to-do blocks (checkbox), blockquotes, code blocks, dividers,
  callouts** — mostly new block types + input rules (`[] `, `> `, ``` ``` ```, `--- `)
  on the existing tree; code blocks need a no-marks/no-input-rules content mode.
  Read `.gravity/core/SPEC.md` first.
