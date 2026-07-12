# @custom-wysiwyg/export-html

Serialize [`@custom-wysiwyg/core`](https://www.npmjs.com/package/@custom-wysiwyg/core)
documents to clean semantic HTML. Pure model-in/string-out — no DOM required,
so it runs identically in the browser, Node, and React Server Components.

```bash
npm install @custom-wysiwyg/export-html
```

```ts
import { serializeHTML } from '@custom-wysiwyg/export-html'

const html = serializeHTML(editor.getState().doc)
// '<h1>Hello</h1>\n<p style="text-align: center">…</p>'
```

Covers the full block set (headings, lists, todos, quotes, code, callouts,
dividers, tables with column alignment) and all marks — styled text composes
into escaped `<span style>` runs. The inverse (HTML → model) ships in core as
`parseHTML`, powering rich paste.

Part of the [custom-wysiwyg-editor](https://github.com/mostlytricks/custom-wysiwyg-editor)
family. MIT licensed.
