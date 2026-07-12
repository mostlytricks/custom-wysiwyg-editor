# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-12

## Completed
- **Publishing setup (last Ongoing item).** All 7 packages publish-ready:
  inter-package deps fixed from `"*"` (published literally by npm — any-version
  hazard) to lockstep `^0.2.4` ranges; `repository`/`homepage`/`bugs` +
  `publishConfig: { access: public }` everywhere; MIT `LICENSE` at root and in
  each package; per-package READMEs (snippets verified against the real APIs);
  tag-triggered `.github/workflows/publish.yml` (gate → `npm publish
  --workspaces --provenance`). Tarballs verified with `npm pack --dry-run`
  (LICENSE + README + full dist each). Decision: lockstep + `/cut-release`
  retained, changesets not adopted — release procedure in `CLAUDE.md` updated
  (dep ranges now bump with the version). Docs site deferred.
- **Clawd** 🐉 (owner-requested fun tweak): opt-in `packages/ui` widget — a
  dragon at the editor's top-right that jazzes on 'change' events and winds down
  after a 1.2s cooldown. Cosmetic-only (aria-hidden, pointer-events none,
  reduced-motion safe), React `<Clawd>` wrapper, demo wired. 196/196 unit
  (5 new), 11-check `smoke-clawd` browser suite.
- **Formatting track finished + v0.2.4 cut and merged** (PR #4): fontFamily
  mark, custom color pickers, block-indent won't-build decision, build-race
  fix.

## Current State
- **7-package monorepo, every planned arc shipped, npm-ready**: Phases 0-4,
  complete formatting track, HTML/Markdown import + rich paste, agent adapter.
- **Owner-side to actually publish**: (1) create the npm org `custom-wysiwyg`
  (scope unclaimed as of 2026-07), (2) add the `NPM_TOKEN` repo secret,
  (3) push the tags — v0.2.0 → 5bbf7dc, v0.2.1 → 555cbaf, v0.2.2 → `release:
  v0.2.2` commit, v0.2.3 → 9736d8b, v0.2.4 → 25adf76 (session proxy rejects
  tag pushes; a fresh tag push will trigger publish.yml once secrets exist).
- Table v1 walls documented in `core/SPEC.md` Gotchas.

## Next Step
- **First live agent pass** (owner's call per `integration/PLAN.md`: Claude via
  MCP or a local API script — the adapter is agent-agnostic). Remaining backlog
  after that: docs site (deferred).
