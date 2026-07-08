# Changelog

All notable changes to **custom-wysiwyg-editor** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version source of truth
is the git tag `vX.Y.Z` + the root `package.json` `version` (never prose) — see
`CLAUDE.md` → **Releasing** for the cut procedure (or run `/cut-release
custom-wysiwyg-editor` from the workspace).

> Pre-1.0 on purpose — the model/API may still change (until 1.0.0: breaking → minor,
> feature/fix → patch). The five workspace packages version in lockstep with the root.

## [Unreleased]

### Changed
- **BREAKING — recursive block tree (Phase 2 groundwork).** The document model is now a
  tree: a block's inline spans moved from `children` to **`content`**, and `children`
  is an optional array of nested `BlockNode`s. Positions are path-based:
  `{ block: number, offset }` → **`{ path: number[], offset }`** (`[0]` = first
  top-level block, `[0, 1]` = its second child). All commands, selection mapping
  (`data-block` → `data-path` in the rendered DOM), input rules, ui widgets, and both
  exporters operate on the tree; new path helpers (`blockAt`, `comparePaths`,
  `blockEntries`, `replaceBlockAt`, …) are exported from `@custom-wysiwyg/core`.
  Editing behavior over flat documents is unchanged (all v0.1.0 tests pass translated;
  real-browser smoke green). Exporter tree semantics are provisional until list types
  land: HTML nests children in `<div class="cwe-children">`, Markdown flattens them to
  sibling blocks.

## [0.1.0] - 2026-07-08

### Added
- **Phase 0 — walking skeleton.** Monorepo (`core` / `ui` / `react` / `export-markdown` /
  `export-html`); JSON document model (paragraphs, headings h1–h3, bold/italic/code/link
  marks, block alignment); editing via pure commands (typing, Enter, cross-block
  Backspace/Delete, plain-text paste, undo/redo with typing coalescing, IME composition,
  stored marks); deterministic Markdown + HTML export; React bindings (`useEditor` /
  `<Editor>`, SSR-safe, `'use client'` baked in); CI + vanilla demo + Chromium smoke tests.
- **Phase 1 — Notion feel.** Slash menu (`/` palette), bubble toolbar with active states,
  Markdown input rules (`# `→h1–h3, `**bold**`, `*italic*`, `` `code` ``), placeholder
  text, editor event system (`change`/`update`/`focus`/`blur`); `@custom-wysiwyg/ui` stays
  framework-free with React wrappers.
- **`.gravity/` doc system (v1.8).** Roadmap + status spine in
  `.gravity/IMPLEMENTATION_PLAN.md`; evidence-tagged engine contract in
  `.gravity/core/SPEC.md`; the agent-adapter seam in `.gravity/integration/PLAN.md`
  (corrected: gravity is the doc system, not an AI runtime — the editor-side `transact`
  contract is the real seam); protocol card, router `CLAUDE.md`, `AGENTS.md` shim,
  `CONTEXT.md`.

### Known gaps
- Link button uses `window.prompt`; undo after autoformat doesn't restore literal `**`
  syntax; no HTML/Markdown import yet.
