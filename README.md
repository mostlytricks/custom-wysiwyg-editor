# custom-wysiwyg-editor

A custom WYSIWYG editor built for **compatibility**: embed it on a plain website with a `<script>` tag, or drop it into React / Next.js with first-class TypeScript bindings. Content exports to **Markdown** and **HTML** — including aligned text.

## Architecture

The DOM is never the source of truth. The editor keeps an internal **JSON document model** (typed blocks + text spans with marks); `contenteditable` is only a view and input-capture layer. Input events (`beforeinput`) are intercepted, translated into pure commands against the model, and the DOM re-renders from the result. That's what makes export deterministic across browsers — and it's the seam where external actors (toolbars, AI agents, collaboration) drive the editor through the same door as keystrokes.

```
packages/
  core/             @custom-wysiwyg/core             framework-free engine (zero deps)
  ui/               @custom-wysiwyg/ui               Notion-style widgets: bubble toolbar, slash menu (framework-free)
  react/            @custom-wysiwyg/react            React/Next.js bindings ('use client', SSR-safe)
  export-markdown/  @custom-wysiwyg/export-markdown  model → Markdown
  export-html/      @custom-wysiwyg/export-html      model → clean HTML
```

Every package ships ESM + CJS + type declarations; `core` and the exporters also ship self-contained IIFE bundles for `<script>` embedding.

## Quick start

```bash
npm install        # install workspace deps
npm run build      # build all packages (tsup)
npm test           # vitest (model, commands, serializers, DOM view)
```

Then open `examples/vanilla/index.html` in a browser for a zero-framework demo with a toolbar and live Markdown/HTML export.

### Plain website

```html
<script src="core/dist/index.global.js"></script>
<script src="ui/dist/index.global.js"></script>
<script>
  const { Editor, doc, paragraph, text } = CustomWysiwyg
  const editor = new Editor(document.getElementById('editor'), {
    doc: doc(paragraph([text('Hello')])),
    placeholder: "Type '/' for commands…",
    onChange: (ed) => console.log(ed.getDoc()),
  })
  new CustomWysiwygUI.BubbleMenu(editor) // floating toolbar over selections
  new CustomWysiwygUI.SlashMenu(editor)  // type '/' for a block palette
</script>
```

### React / Next.js

```tsx
import { useState } from 'react'
import { BubbleMenu, SlashMenu, useEditor } from '@custom-wysiwyg/react'
import { serializeMarkdown } from '@custom-wysiwyg/export-markdown'

export default function Page() {
  const { ref, editor } = useEditor({ onChange: (doc) => console.log(serializeMarkdown(doc)) })
  return (
    <>
      <div ref={ref} />
      <BubbleMenu editor={editor} />
      <SlashMenu editor={editor} />
    </>
  )
}
```

(Or use the `<Editor>` component instead of the hook when you don't need the instance.)

The package is a client-component boundary (`'use client'` is baked into the bundle) and touches the DOM only after mount, so it works in the App Router without `dynamic(..., { ssr: false })`. For server-side rendering of *content* (not the editor), `serializeHTML(doc)` runs fine in Node/RSC.

There's also a `useEditor()` hook when you need the instance for a toolbar:

```tsx
const { ref, editor } = useEditor({ onChange })
// <div ref={ref} />  +  editor?.commands.setHeading(2)
```

## The document model

```ts
type DocNode = { type: 'doc'; children: BlockNode[] }
type BlockNode = ParagraphNode | HeadingNode          // discriminated unions
type TextSpan = { type: 'text'; text: string; marks: Mark[] }
type Mark = BoldMark | ItalicMark | CodeMark | LinkMark
```

Blocks carry `attrs.align` (`left | center | right | justify`). Commands are pure functions `(EditorState) => EditorState | null` — fully unit-testable without a browser.

## Export

```ts
import { serializeMarkdown } from '@custom-wysiwyg/export-markdown'
import { serializeHTML } from '@custom-wysiwyg/export-html'

serializeHTML(doc)      // <h1>…</h1>\n<p style="text-align: center">…</p>
serializeMarkdown(doc)  // # …  with **bold**, *italic*, `code`, [links](…)
```

Markdown has no alignment syntax, so aligned blocks fall back to inline HTML (CommonMark-legal, rendered by GitHub and most renderers). Pass `{ alignedBlocks: 'plain' }` to drop alignment instead.

## What works today

- Typing, Enter (block split), Backspace/Delete (incl. cross-block merge), paste as plain text
- Bold / italic / inline code / links; Cmd/Ctrl+B, Cmd/Ctrl+I; stored marks (toggle then type)
- **Text color, highlight, and font size** via the bubble-menu palette — exports as `<span style>` in HTML, inline-HTML fallback in Markdown (`styledText: 'plain'` to drop)
- Paragraphs, headings h1–h3, text alignment
- **Bulleted & numbered lists** with Tab/Shift+Tab nesting, `- `/`1. ` shortcuts, and list-aware Enter/Backspace (empty item exits, marker strips before merge)
- **To-dos** (clickable checkboxes, GFM `- [ ]` export), **blockquotes**, **code blocks** (verbatim, fenced export), **dividers**, and **callouts** — with `[] `, `> `, ` ``` `, `--- ` shortcuts and slash-menu entries
- Undo/redo with typing coalescing (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z)
- IME composition (composed text is applied to the model on compositionend)
- **Slash menu**: type `/` for a searchable block palette (arrows + Enter, Esc to dismiss, extensible items)
- **Bubble toolbar**: floats above any selection with mark/block/align actions and active states
- **Markdown input rules**: `# `/`## `/`### ` → headings; `**bold**`, `*italic*`, `` `code` `` autoformat as you type
- Placeholder text while the document is empty
- Editor events (`change`, `update`, `focus`, `blur`) for building custom UI
- Deterministic Markdown + HTML export

## Roadmap

See **[.gravity/IMPLEMENTATION_PLAN.md](.gravity/IMPLEMENTATION_PLAN.md)** — the roadmap
(phases + per-domain status). Architecture invariants live in [CLAUDE.md](CLAUDE.md);
the agent-integration seam in [.gravity/integration/PLAN.md](.gravity/integration/PLAN.md). Highlights:

- Phase 2 ✅ complete: tree, lists, to-dos, quotes, code blocks, dividers, callouts
- Phase 3: tables (GFM export with column alignment)
- Phase 4: block handles — drag to reorder, hover `+` to insert
- Parallel: HTML/Markdown import, gravity adapter (`editor.transact` contract is ready)

## Development

```
npm test               # unit tests (vitest; DOM tests via happy-dom)
npm run typecheck      # strict TS across all packages
npm run build          # tsup: ESM + CJS + d.ts (+ IIFE for browser packages)
```
