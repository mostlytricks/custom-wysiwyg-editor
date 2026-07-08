# Project Plan & Status

Single source of truth for where this project is going and where it stands.
**Update the checkboxes here whenever work lands.**

## Vision

A custom WYSIWYG library built for **compatibility** — embeds on a plain website
with a `<script>` tag, first-class React/Next.js + TypeScript support, exports to
Markdown and HTML (including aligned text) — evolving toward a **Notion-like
editing experience**, and integrating with the **gravity strategy** from the
`ai-workspace` repo as the AI layer.

## Architecture invariants (do not break)

1. **The DOM is never the source of truth.** The JSON document model is; contenteditable is a view + input-capture layer (`beforeinput` → command → re-render).
2. **Commands are pure functions** `(EditorState) => EditorState | null`. Keystrokes, toolbars, and AI agents all go through the same door.
3. **Core stays framework-free and zero-dependency.** React/Vue/UI layers are thin adapters in separate packages.
4. **Exports are deterministic** — serializers read the model, never the DOM.
5. Nontrivial changes get **real-browser verification** (Playwright smoke) in addition to unit tests — contenteditable bugs (async selectionchange, IME) don't show up in happy-dom.

---

## Phase 0 — Walking skeleton ✅ (done)

- [x] Monorepo: core / react / export-markdown / export-html (+ ui added in Phase 1)
- [x] Document model: paragraphs, headings h1–h3, marks (bold/italic/code/link), block alignment
- [x] Editing: typing, Enter, Backspace/Delete with cross-block merge, plain-text paste, undo/redo with typing coalescing, IME composition, stored marks
- [x] Markdown + HTML export; aligned blocks fall back to inline HTML in Markdown
- [x] React bindings: `useEditor` / `<Editor>`, `'use client'` baked in, SSR-safe
- [x] CI (GitHub Actions), vanilla demo page, Chromium smoke tests

## Phase 1 — Notion feel ✅ (done)

- [x] Slash menu (`/` palette: filter, arrows, Enter, Esc; extensible items)
- [x] Bubble toolbar above selections with active states
- [x] Markdown input rules: `# `→h1…h3, `**bold**`, `*italic*`, `` `code` ``
- [x] Placeholder text; editor event system (`change`/`update`/`focus`/`blur`)
- [x] `@custom-wysiwyg/ui` is framework-free; React wrappers `<BubbleMenu>`/`<SlashMenu>`
- Known polish debt: link button uses `window.prompt`; undo after autoformat doesn't restore the literal `**` syntax

## Phase 2 — Structure (next up)

The one genuinely architectural step. Do this before adding more block types.

- [ ] Migrate model from flat block list to a **recursive block tree**; positions become paths (`{ path: number[], offset }`)
- [ ] Update all commands + selection mapping + both exporters for the tree
- [ ] Bulleted / numbered lists (Tab/Shift+Tab indent, input rules `- `, `1. `)
- [ ] To-do blocks (checkbox), blockquotes, code blocks, dividers, callouts
- [ ] Extend slash-menu items + exporters for each new type

## Phase 3 — Tables

- [ ] Table node (rows → cells → inline content)
- [ ] Cell-aware selection; Tab/arrow navigation; add/remove row & column UI
- [ ] Markdown export as GFM tables (column alignment via `:---:` — no HTML fallback needed)

## Phase 4 — Blocks as objects

- [ ] Hover gutter: `⠿` drag handle + `+` insert button
- [ ] Drag-and-drop block reordering (`moveBlock` command)
- [ ] Block-level selection mode (click handle / Esc)

## Ongoing / parallel track

- [ ] HTML & Markdown **import** (rich paste, load saved content) — biggest compatibility gap
- [ ] Publishing setup: npm scope, versioning (changesets), docs site
- [ ] Undo of input rules restores literal syntax; inline link editor

---

## Gravity integration (`ai-workspace`)

Goal: gravity proposes/prioritizes edits; the editor applies them as normal,
undoable transactions.

### Editor-side contract — ✅ shipped, stable

| Need | API |
| --- | --- |
| Read document | `editor.getDoc()` → plain JSON |
| Read as LLM context | `serializeMarkdown(doc)` (or `serializeHTML`) |
| Apply an edit (undoable, fires events) | `editor.transact(state => newState)` — compose pure commands (`insertText`, `deleteRange`, `setHeading`, …) |
| Load wholesale (resets history) | `editor.setDoc(doc)` — loading only, not agent edits |
| Observe | `editor.on('change' \| 'update' \| 'focus' \| 'blur', cb)` |
| Target the user's position | `editor.getState().selection` (`{block, offset}`) |

### Blocked / to resolve from ai-workspace

Repo access from this session is pending approval (`add_repo` gate). Unblock by
adding `ai-workspace` as a session source, granting the GitHub app access, or
pasting the strategy into chat. Then answer:

1. What gravity **consumes** (docs? tasks? events?) and what **triggers** a pass
2. What gravity **produces** (text? structured edits? rankings?)
3. **Runtime shape** (library / local server / remote service)
4. **Streaming?** If yes, adapter buffers into block-sized `transact` calls
5. Confirm **naming/vocabulary** for the adapter API

### Local PC test recipe ("full test")

```bash
cd custom-wysiwyg-editor
git checkout claude/chat-session-awyh1b
npm install && npm run build && npm test     # expect all green
# open examples/vanilla/index.html            # manual sanity check

# link into ai-workspace (in ai-workspace/package.json):
#   "@custom-wysiwyg/core": "file:../custom-wysiwyg-editor/packages/core"
```

First milestone (no gravity logic): a script in ai-workspace that subscribes to
`change`, logs `serializeMarkdown(doc)` on every edit, and applies one hardcoded
`transact` edit. When that round-trips, the pipe is proven.

### Sequence

1. [x] Editor-side contract (`transact`, events, exporters)
2. [ ] `ai-workspace` access (or local link test run by owner)
3. [ ] Fill the five answers above; confirm adapter naming
4. [ ] Build thin `@custom-wysiwyg/gravity-adapter` + round-trip smoke test
5. [ ] First real gravity pass driving `transact` edits in the demo
