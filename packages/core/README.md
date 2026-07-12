# @custom-wysiwyg/core

Framework-agnostic WYSIWYG editor core: JSON document model, pure commands,
undo/redo, and a contenteditable view. Zero dependencies.

```bash
npm install @custom-wysiwyg/core
```

```ts
import { Editor } from '@custom-wysiwyg/core'

const editor = new Editor(document.getElementById('editor')!, {
  placeholder: 'Type / for blocks…',
})

editor.commands.toggleBold()
editor.on('change', () => console.log(editor.getState().doc))
```

The JSON model is the source of truth; the DOM is only a view. All edits are
pure commands `(EditorState) => EditorState | null` — external actors (agents,
collaborators) go through `editor.transact()` and share the same undo history
as keystrokes.

Part of the [custom-wysiwyg-editor](https://github.com/mostlytricks/custom-wysiwyg-editor)
family: UI widgets (`@custom-wysiwyg/ui`), React bindings (`@custom-wysiwyg/react`),
Markdown/HTML export and import, and an agent adapter. MIT licensed.
