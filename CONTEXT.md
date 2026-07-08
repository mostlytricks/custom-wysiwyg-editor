# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-08

## Completed
- **Adopted the `.gravity/` doc system (v1.8) + registered in the workspace** — `docs/PLAN.md`
  restructured into `.gravity/IMPLEMENTATION_PLAN.md` (vision + phases + status spine, `git mv`
  so history survives); two domains minted: `core/SPEC.md` (evidence-tagged engine contract)
  and `integration/PLAN.md` (the agent-adapter seam — **corrected**: the old plan mistook
  gravity for an AI runtime; it's this doc system; the editor-side contract table survives
  as the real seam). Root `CLAUDE.md` is now the router; protocol card at `.gravity/GRAVITY.md`;
  `AGENTS.md` shim added; junctioned into `active/` + PROJECTS.md row. Uncommitted — review the
  staged moves.
- **Phases 0–1 shipped** (pre-adoption, PR #1): walking skeleton + Notion feel. Detail: git log
  + `.gravity/IMPLEMENTATION_PLAN.md`.

## Current State
- 5-package monorepo (core / ui / react / export-markdown / export-html); Phases 0–1 done,
  `main` pushed to `github.com/mostlytricks/custom-wysiwyg-editor`.
- `node_modules` **not installed** in this checkout — gate (`npm run typecheck && npm test`)
  not run since adoption; the restructure touched only docs.
- Known polish debt: link button uses `window.prompt`; undo after autoformat doesn't restore
  literal `**` syntax.

## Next Step
- **Review + commit the gravity adoption** (staged `git mv` + new docs). Then start
  **Phase 2 — block tree** (`.gravity/IMPLEMENTATION_PLAN.md`), reading `.gravity/core/SPEC.md`
  first; `npm install && npm run typecheck && npm test` to re-establish the green baseline
  before any code change.
