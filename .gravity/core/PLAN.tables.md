# PLAN — tables (Phase 3)

**Goal:** editable tables with cell navigation and GFM export, on the existing
block tree — no parallel table machinery.

## Scenario

given the caret in a paragraph, when the user picks "Table" from the slash menu
→ a 3×3 table (header row + 2 body rows) appears and the caret lands in the
first header cell. Typing fills cells; **Tab/Shift+Tab** move across cells
(Tab on the last cell adds a row); **Enter** moves to the cell below (adding a
row at the bottom); arrow keys cross cell borders natively. `setAlign` inside a
cell aligns the **column**. Markdown export is a GFM table with `:-:`/`--:`
alignment markers; HTML export is `<table>` with `<th>` header and per-column
`text-align`.

## Design decisions

- **Table = ordinary tree nodes**: `table` → `tableRow` → `tableCell` blocks;
  a cell's text is its `content`. Paths, selection mapping (`data-path`), and
  mark commands then work unchanged — only *structural* commands need guards.
- **First row is the header** (GFM requires one; `<th>` in HTML).
- **Column alignment lives on `table.attrs.columnAligns`**, not on cells —
  matches GFM's column-level model and keeps `setAlign` semantics.
- **Cell walls (v1)**: structural edits never cross a cell boundary — cross-cell
  ranges no-op for insert/delete/split; Backspace at cell start no-ops; cells
  hold inline text only (no nested blocks, no merges). Deleting a whole table:
  `deleteTable` command, or a range strictly containing it.
- Conversions (`setHeading`, `setList`, …) skip `table`/`tableRow`/`tableCell`.

## Slice

- [x] Model: node types + builders; `cellContext`/edit-scope helpers
- [x] Guards: structural commands respect cell walls; conversions skip table nodes
- [x] Commands: `insertTable`, `addTableRow`, `addTableColumn`, `deleteTableRow`,
      `deleteTableColumn`, `deleteTable`; `setAlign` → column align in cells
- [x] Editor: Tab/Shift+Tab and Enter navigation, grow-on-Tab/Enter at the edge
- [x] View: `<table>/<tr>/<th|td>` all carrying `data-path` (children render
      *inside* here — safe because table/row own no text)
- [x] Export: GFM (pipe-escaped cells, alignment row); HTML (`thead/th` + `tbody/td`)
- [x] UI: slash item; table CSS
- [x] Tests + Chromium smoke; SPEC contract rows; plan/CONTEXT updates

## Verification

Gate (`npm run typecheck && npm test`) + browser smoke: slash-insert, typing in
cells, Tab/Enter navigation incl. growth, cell-wall no-ops, alignment, both
export panes. Behaviors that survive get promoted into `core/SPEC.md`.

## Outcome (2026-07-09)

Shipped as planned. All slice boxes done; behaviors promoted into `core/SPEC.md`.
Deviation: row/column management is commands + keyboard growth (Tab/Enter at the
edge) — hover chrome for add/remove buttons is deferred to Phase 4 block chrome.
Known v1 walls documented in SPEC Gotchas (no cell merges, inline-only cells,
select-all delete stops at tables).
