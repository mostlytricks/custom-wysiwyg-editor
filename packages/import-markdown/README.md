# @custom-wysiwyg/import-markdown

Parse Markdown into [`@custom-wysiwyg/core`](https://www.npmjs.com/package/@custom-wysiwyg/core)
documents — the GFM subset the editor exports (headings, lists, task lists,
quotes, fenced code, tables, bold/italic/code/link).

```bash
npm install @custom-wysiwyg/import-markdown
```

```ts
import { parseMarkdown } from '@custom-wysiwyg/import-markdown'

editor.setDoc(parseMarkdown('# Hello\n\n- [x] ship it'))
```

Round-trips with [`@custom-wysiwyg/export-markdown`](https://www.npmjs.com/package/@custom-wysiwyg/export-markdown);
inline HTML degrades to plain text (use core's `parseHTML` for HTML input).

Part of the [custom-wysiwyg-editor](https://github.com/mostlytricks/custom-wysiwyg-editor)
family. MIT licensed.
