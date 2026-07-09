# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-09

## Completed
- **Agent adapter shipped — every planned arc is now done.** Pipe milestone proven
  in Chromium (transact edit + exactly-one change event + byte-identical undo),
  then `@custom-wysiwyg/agent-adapter` (7th pkg) designed from that usage:
  context out (markdown/selection), `applyMarkdown` modes as single undoable
  transactions, block-buffered `StreamWriter`; scripted 🤖 session in the demo.
  Design finding: core `insertBlocks` needed `{ inline?: boolean }` — streamed
  continuations must not splice into the previous block. Gate green: 180/180
  (8 new); browser smoke 125/125 across eleven suites (15 new).
- **v0.2.1 cut** (patch: import + Phase 4 are features, no breaking — per the
  pre-1.0 rule). Tag pending owner push, same as v0.2.0: from a local clone,
  `git tag v0.2.1 <release-sha> && git push origin v0.2.1`.
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
- **First live agent pass** (owner's call per `integration/PLAN.md`: Claude via MCP
  or a local API script — the adapter is agent-agnostic). Otherwise: formatting
  open slices (font family, custom colors), publishing setup (npm scope), or cut
  the next release when evidence accumulates. Tags v0.2.0/v0.2.1 still pending
  owner push (see git history for SHAs).
