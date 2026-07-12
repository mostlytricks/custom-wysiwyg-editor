# SPEC — formatting (text styling & alignment)

Compact agent contract for **how styling attaches to text and survives export**:
marks (bold/italic/code/link/color/highlight/fontSize/fontFamily), block
alignment, stored marks, and the export-fallback policy. The *engine mechanics* (command shape,
path helpers, view walls) stay in `../core/SPEC.md` — read both before changing
styling behavior.

**Gate:** `npm run typecheck && npm test`; for anything selection-driven (bubble
palette, stored marks) also run the Chromium smoke `[review]`.

<!-- Enforcement legend:
     [type]      tsc rejects it   [test:name]  a named test asserts it
     [review]    human judgment only (said honestly)   [—] guidance -->

## The mark model

Marks are a flat set on each `TextSpan`. Two families:

- **Boolean marks** — `bold`, `italic`, `code`: present or absent; `toggleMark` flips them.
- **Valued marks** — `link { href }`, `color { value }`, `highlight { value }`,
  `fontSize { value }`, `fontFamily { value }`: at most one *of each type* per
  span; **setting a new value replaces the old one, it never toggles off** —
  removal is explicit (`removeMark(type)` / passing `null` in the editor command).

`fontSize.value` is a **token** (`'small' | 'large' | 'huge'`), not a CSS length —
render/export own the token→size mapping (one place: `FONT_SIZES`). Likewise
`fontFamily.value` is a token (`'serif' | 'mono'`; default font = mark absent)
mapped through `FONT_FAMILIES`; the HTML importer maps stacks back by exact match,
else a keyword sniff (`mono` / `serif`-but-not-`sans-serif`). Colors are CSS
color strings; the UI offers a fixed palette **plus a native custom picker**, and
the model accepts any string (export must escape them).

## Minimal Shape — a new valued mark

1. Add the interface + union entry in `core/src/model/types.ts`; extend `marksEqual`.
2. Wire rendering (`view/render.ts` `renderSpan`) **and both exporters** in the same
   slice — a mark that renders but doesn't export is a data-loss bug.
3. Editor command takes `value | null` (`null` = remove). Bubble palette is optional UI.
4. Add rows to the Behavioral Contract with named tests.

## Rules

- `[test:marks]` Applying a valued mark over a range that already has one of that type **replaces** it (no toggle-off surprise); `toggleMark` stays reserved for boolean marks.
- `[test:marks]` With a collapsed selection, valued marks go to `storedMarks` exactly like boolean ones (set → next typed char styled; removal clears from stored set).
- `[test:export]` **Styling must survive HTML export losslessly** (`<span style>` composition) and **degrade explicitly in Markdown**: inline-HTML fallback by default, dropped under `{ styledText: 'plain' }` — never silently mangled.
- `[review]` Style values land in `style="…"` attributes — always escape (`escapeHTML`) since colors are free-form strings.
- `[review]` Markers/styling must never add DOM text nodes (see core SPEC selection-mapping wall).
- `[—]` Alignment stays a **block attr** (`attrs.align`), not a mark — it describes the block box, not a text run. Its rules (preserved across type changes, `left` = attr removed) live in core's command tests.

## Behavioral Contract

- given red text, when blue is applied over it → the range is blue (single color mark, replaced) `[test:marks]`
- given styled text, when `removeMark('color')` runs → only the color goes; other marks survive `[test:marks]`
- given a collapsed caret, when a color is set and text is typed → the new text carries the color `[test:marks]`
- given colored+sized text, when exported to HTML → one `<span style>` carrying both declarations `[test:export]`
- given styled text, when exported to Markdown (default) → inline `<span style>` fallback; with `styledText: 'plain'` → clean Markdown, styles dropped `[test:export]`
- given serif text, when mono is applied over it → the range is mono (replaced, never toggled off); `removeMark('fontFamily')` restores the default font `[test:marks]`
- given a `fontFamily` mark, when exported to HTML/Markdown → the token's CSS stack in the span style; when that HTML is parsed back → the token round-trips `[test:export]` `[test:parse-html]`

## UI gotcha — inputs inside the bubble

The bubble menu keeps focus in the editor via a dom-level `mousedown`
`preventDefault`. Anything that must take real focus (link input, custom color
pickers) opts out with `stopPropagation` **and** must arm a guard flag before
the editor's `blur` fires (`linkOpen` / `pickerOpen`), or the bubble hides
under the user's cursor. The model selection survives the blur; commit paths
re-apply and refocus. `[review]` + Chromium smoke (`smoke-format2`).

## Resolved

- Font family — shipped as the valued mark above (v0.2.x): default / serif / mono.
- Custom color input — shipped: native `<input type="color">` in the Text and
  Mark palette rows; model unchanged (already accepted any CSS color).
- Generic block indent for non-list blocks — **won't build.** Decision: nesting
  is the mechanism (Tab in lists, `children` everywhere else, gutter drag for
  restructuring); a per-block indent attr would duplicate hierarchy state and
  desync exports. Revisit only if a flat-indent use case shows up that nesting
  can't express.
