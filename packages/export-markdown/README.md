# @custom-wysiwyg/export-markdown

Serialize [`@custom-wysiwyg/core`](https://www.npmjs.com/package/@custom-wysiwyg/core)
documents to Markdown (GFM: task lists, fenced code, tables with alignment).

```bash
npm install @custom-wysiwyg/export-markdown
```

```ts
import { serializeMarkdown } from '@custom-wysiwyg/export-markdown'

serializeMarkdown(doc)
// aligned/styled text falls back to inline HTML by default
serializeMarkdown(doc, { alignedBlocks: 'plain', styledText: 'plain' })
// …or degrades explicitly to clean Markdown
```

Markdown has no syntax for alignment, colors, sizes, or font families — the
options above choose between an inline-HTML fallback (default, lossless for
HTML renderers) and dropping the styling. The inverse parser is
[`@custom-wysiwyg/import-markdown`](https://www.npmjs.com/package/@custom-wysiwyg/import-markdown).

Part of the [custom-wysiwyg-editor](https://github.com/mostlytricks/custom-wysiwyg-editor)
family. MIT licensed.
