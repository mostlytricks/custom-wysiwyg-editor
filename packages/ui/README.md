# @custom-wysiwyg/ui

Notion-style UI widgets for [`@custom-wysiwyg/core`](https://www.npmjs.com/package/@custom-wysiwyg/core):
bubble toolbar (marks, colors, sizes, fonts, links), slash menu, block gutter
with drag-and-drop, and table chrome. Framework-free DOM components.

```bash
npm install @custom-wysiwyg/core @custom-wysiwyg/ui
```

```ts
import { Editor } from '@custom-wysiwyg/core'
import { BubbleMenu, SlashMenu } from '@custom-wysiwyg/ui'

const editor = new Editor(document.getElementById('editor')!)
new BubbleMenu(editor)
new SlashMenu(editor)
```

Styles are injected automatically (light + dark). Using React? Prefer the
wrappers in [`@custom-wysiwyg/react`](https://www.npmjs.com/package/@custom-wysiwyg/react).

Part of the [custom-wysiwyg-editor](https://github.com/mostlytricks/custom-wysiwyg-editor)
family. MIT licensed.
