# CONTEXT — custom-wysiwyg-editor

<!-- This file is a ROLLING SNAPSHOT of *now*, not a log. git history is the changelog
     (`git log -p CONTEXT.md` recovers every past version), so pruning here loses nothing.
     Keep it small: Completed = last 1-2 sessions, Current State overwritten to present
     reality, Next Step = one item. Trim when Completed > ~6 bullets or file > ~80 lines.
     See workspace CLAUDE.md §6 "Keeping CONTEXT.md small". -->

Last touched: 2026-07-12

## Completed
- **Formatting track finished — spine domain flipped to ✓.** (1) *Font family
  mark*: valued mark `fontFamily` (`serif`/`mono` tokens via `FONT_FAMILIES`),
  render + both exporters + HTML-importer reverse map (exact stack, else keyword
  sniff), `setFontFamily` command, Font row in the bubble palette with active
  states. (2) *Custom color pickers*: native `<input type="color">` in the Text
  and Mark palette rows; the bubble focus-guard gained a `pickerOpen` flag
  (armed on picker mousedown, before the editor blur) so the bubble survives
  picker focus. (3) *Block indent decision*: won't build — nesting is the
  mechanism; recorded in `formatting/SPEC.md` Resolved. Gate green: 191/191
  unit (5 new), 16-check `smoke-format2` browser suite + all 11 regression
  suites pass.
- **Build race fixed**: root `build` script now chains the workspace builds
  strictly in dependency order (`&&`), killing the flaky TS2307 DTS race.
- v0.2.3 cut previously; tags v0.2.0 → 5bbf7dc, v0.2.1 → 555cbaf,
  v0.2.2 → `release: v0.2.2` commit, v0.2.3 → 9736d8b still pending owner push
  (session proxy rejects tag pushes).

## Current State
- **7-package monorepo, every planned arc shipped and every spine domain ✓**:
  Phases 0-4 (full block set through tables, block chrome, Esc selection), the
  complete formatting track (boolean marks, link, align, color/highlight/
  fontSize/fontFamily, custom colors), HTML/Markdown import + rich paste, and
  the agent adapter — all exporting to Markdown (GFM) + HTML, 191 unit tests.
- Table v1 walls (no merges, inline-only cells, select-all stops at tables) are
  documented in `core/SPEC.md` Gotchas.
- Unreleased changes accumulating in `CHANGELOG.md` (font family, custom
  colors, build-race fix) — a patch cut is ready whenever wanted.

## Next Step
- **First live agent pass** (owner's call per `integration/PLAN.md`: Claude via
  MCP or a local API script — the adapter is agent-agnostic). Otherwise:
  publishing setup (npm scope, changesets, docs site) is the last open backlog
  item. Tags v0.2.0–v0.2.3 still pending owner push.
