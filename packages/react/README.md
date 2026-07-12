# @custom-wysiwyg/react

React bindings for [`@custom-wysiwyg/core`](https://www.npmjs.com/package/@custom-wysiwyg/core) —
SSR-safe, Next.js App Router ready (`'use client'` is baked into the build).

```bash
npm install @custom-wysiwyg/core @custom-wysiwyg/ui @custom-wysiwyg/react
```

```tsx
'use client'
import { useState } from 'react'
import { Editor, BubbleMenu, SlashMenu, type CoreEditor } from '@custom-wysiwyg/react'

export default function MyEditor() {
  const [editor, setEditor] = useState<CoreEditor | null>(null)
  return (
    <>
      <Editor onReady={setEditor} onChange={(doc) => console.log(doc)} />
      <BubbleMenu editor={editor} />
      <SlashMenu editor={editor} />
    </>
  )
}
```

`useEditor` is also exported for custom mounting (`const { ref, editor } = useEditor()`),
and the `<Editor>` forwarded ref exposes the core instance (commands, undo/redo,
`getDoc`). The editor is only constructed in the browser, so server rendering
just works.

Part of the [custom-wysiwyg-editor](https://github.com/mostlytricks/custom-wysiwyg-editor)
family. MIT licensed.
