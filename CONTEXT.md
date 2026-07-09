# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-09

## Completed
- **Polish debt cleared (both items in the Ongoing track).** (1) *Inline link
  editor* — `window.prompt` replaced by an in-bubble URL input with set / edit
  (prefills the current href, `applyMark` replaces so URL edits work) / remove,
  Enter-to-apply / Esc-to-cancel; survives the editor blur that input-focus
  causes by freezing the bubble and restoring the captured selection on commit
  (`packages/ui/src/bubble-menu.ts` + `styles.ts`). (2) *Autoformat undo* —
  `insertTextWithRules` now commits the literal text as its own undo step before
  the transform, so one Ctrl+Z restores `**bold**` before a second removes it
  (`packages/core/src/editor.ts`). Gate green: 186/186 (6 new — 1 core
  beforeinput-driven undo test, 5 ui link-editor tests).
- **v0.2.3 cut** (patch; commit `9736d8b`, tag `v0.2.3` created locally, not pushed).
  Tags pending owner push: v0.2.0 → 5bbf7dc, v0.2.1 → 555cbaf, v0.2.2 →
  `release: v0.2.2` commit, v0.2.3 → 9736d8b (only v0.1.0 and v0.2.3 tags exist
  locally — the rest still need backfilling from a clone).

## Current State
- **7-package monorepo, every planned arc shipped**: Phases 0-4 (full block set through
  tables, block chrome, Esc selection), styling marks, HTML/Markdown import + rich
  paste, and the agent adapter — all exporting to Markdown (GFM) + HTML, 186 unit tests.
- Table v1 walls (no merges, inline-only cells, select-all stops at tables) are
  documented in `core/SPEC.md` Gotchas.
- **Known issue (pre-existing, unrelated to the debt fixes):** the parallel workspace
  `npm run build` races — `agent-adapter`'s DTS step can start before
  `import-markdown` emits its `.d.ts` (TS2307). JS bundles build fine; only the
  type-declaration phase is flaky. The release gate is `typecheck && test` (both
  green), so this never blocked a release. Fix candidate: sequence the workspace
  builds or add `dependsOn` ordering.

## Next Step
- **First live agent pass** (owner's call per `integration/PLAN.md`: Claude via MCP
  or a local API script — the adapter is agent-agnostic). Otherwise: fix the build
  race above, tackle formatting open slices (font family, custom colors), or
  publishing setup (npm scope). Tags v0.2.0/v0.2.1/v0.2.2 still pending owner push.
