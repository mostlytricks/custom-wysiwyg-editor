# custom-wysiwyg-editor

A custom WYSIWYG editor built for **compatibility**: embed it on a plain website with a `<script>` tag, or drop it into React / Next.js with first-class TypeScript bindings. Content exports to **Markdown** and **HTML** — including aligned text.

## Architecture

The DOM is never the source of truth. The editor keeps an internal **JSON document model** (typed blocks + text spans with marks); `contenteditable` is only a view and input-capture layer. Input events (`beforeinput`) are intercepted, translated into pure commands against the model, and the DOM re-renders from the result. That's what makes export deterministic across browsers — and it's the seam where external actors (toolbars, AI agents, collaboration) drive the editor through the same door as keystrokes.

```
packages/
  core/             @custom-wysiwyg/core             framework-free engine (zero deps)
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
<script src="dist/index.global.js"></script>
<script>
  const { Editor, doc, paragraph, text } = CustomWysiwyg
  const editor = new Editor(document.getElementById('editor'), {
    doc: doc(paragraph([text('Hello')])),
    onChange: (ed) => console.log(ed.getDoc()),
  })
  editor.commands.toggleBold()
</script>
```

### React / Next.js

```tsx
import { Editor } from '@custom-wysiwyg/react'
import { serializeMarkdown } from '@custom-wysiwyg/export-markdown'

export default function Page() {
  return <Editor onChange={(doc) => console.log(serializeMarkdown(doc))} autoFocus />
}
```

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
- Paragraphs, headings h1–h3, text alignment
- Undo/redo with typing coalescing (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z)
- IME composition (composed text is applied to the model on compositionend)
- Deterministic Markdown + HTML export

## Roadmap

- HTML/Markdown **import** (paste rich text, set initial content from HTML)
- Lists, blockquotes, images
- Cross-block mark toggling edge cases, smarter caret motion
- Collaboration-ready transaction log (commands are already pure & serializable)

## Development

```
npm test               # unit tests (vitest; DOM tests via happy-dom)
npm run typecheck      # strict TS across all packages
npm run build          # tsup: ESM + CJS + d.ts (+ IIFE for browser packages)
```
