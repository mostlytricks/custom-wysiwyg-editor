# Gravity × Editor — Integration Plan

Plan for connecting the **gravity strategy** (from `ai-workspace`) to this editor.
The editor-side contract below is final and shipped; the gravity-side sections have
explicit slots to fill in once the two are connected. Designed so the first
end-to-end test can run entirely on a local PC.

---

## 1. The contract: how anything external drives this editor

The editor was architected so that an external actor is *not a special case*.
Everything — keystrokes, toolbar buttons, an AI agent — goes through the same
door: **pure commands against a JSON document model**.

| Need | API | Notes |
| --- | --- | --- |
| Read the document | `editor.getDoc(): DocNode` | Plain JSON. Safe to serialize, diff, store, send to an LLM. |
| Read as LLM-friendly text | `serializeMarkdown(doc)` | From `@custom-wysiwyg/export-markdown`. Markdown is the cheapest faithful context format for prompts. |
| Read as HTML | `serializeHTML(doc)` | From `@custom-wysiwyg/export-html`. Runs in Node/RSC too. |
| Apply an edit (undoable) | `editor.transact(state => newState)` | Lands on the undo stack, fires `change`/`update` — identical to a keystroke. Return `null` to abort. |
| Use ready-made edits | `insertText`, `toggleMark`, `setHeading`, `setAlign`, `deleteRange`, … | Pure functions `(EditorState, …) => EditorState` exported from `@custom-wysiwyg/core`; compose them inside `transact`. |
| Replace wholesale | `editor.setDoc(doc)` | Resets history — for loading, **not** for agent edits. Use `transact` for edits. |
| Observe | `editor.on('change' \| 'update' \| 'focus' \| 'blur', cb)` | Returns an unsubscribe function. |
| Selection | `state.selection` (`{block, offset}` positions) | An agent can read *where the user is* and target edits there. |

Example — an agent rewriting the current block:

```ts
import { insertText, deleteRange, blockLength } from '@custom-wysiwyg/core'

editor.transact((state) => {
  const b = state.selection.head.block
  const cleared = deleteRange(state, { block: b, offset: 0 }, { block: b, offset: blockLength(state.doc.children[b]!) })
  return insertText(cleared, aiRewrittenText)
})
```

Key property for gravity: **commands are data-shaped and replayable.** A strategy
that scores, queues, or prioritizes work can represent each proposed edit as
`{ targetDoc | commandList }`, hold it, and apply it later with `transact` —
the editor doesn't care when or who.

## 2. Proposed integration architecture

```
ai-workspace (gravity)                      custom-wysiwyg-editor
┌─────────────────────────┐                 ┌──────────────────────────┐
│ gravity engine           │   proposals    │ @custom-wysiwyg/core     │
│ (scoring / prioritizing) ├───────────────▶│   editor.transact(...)   │
│                          │                │                          │
│                          │◀───────────────┤ on('change') + getDoc()  │
└─────────────────────────┘   doc snapshots │   + serializeMarkdown()  │
        ▲                                   └──────────────────────────┘
        │ adapter package (thin):
        │ @custom-wysiwyg/gravity-adapter  ← lives in THIS repo, depends only on core
```

The adapter is the only code that knows both sides. Keep it thin:

```ts
// the shape to implement once gravity's interface is confirmed
export interface GravityAdapter {
  /** Feed gravity a snapshot on every change (debounced). */
  connect(editor: Editor, gravity: GravityLike): () => void
}
```

## 3. To fill in from `ai-workspace`  ⬅ blocked on repo access

Session repo access is currently scoped to `custom-wysiwyg-editor` only; the
`add_repo` call for `ai-workspace` needs approval. Once readable, resolve:

1. **What gravity consumes** — documents? tasks? events? What triggers a gravity pass?
2. **What gravity produces** — text? structured edits? rankings? Determines whether
   proposals map to `transact` snapshots or to command lists.
3. **Runtime shape** — library, local server, or remote service? Determines whether the
   adapter calls a function or `fetch`es.
4. **Sync/async + streaming** — if responses stream, the adapter should buffer into
   block-sized `transact` calls (one per block keeps undo sane).
5. **Naming** — confirm what "gravity" refers to so the adapter API uses your vocabulary.

## 4. Local PC test plan (the "full test")

Prereqs: Node ≥ 18, both repos cloned side by side.

```bash
# 1. Editor: build this branch
cd custom-wysiwyg-editor
git checkout claude/chat-session-awyh1b
npm install && npm run build && npm test        # expect: all green

# 2. Sanity-check the demo standalone
open examples/vanilla/index.html                 # type, /menu, select-toolbar, exports

# 3. Link the editor into ai-workspace (pick one)
#    a) file dependency (simplest):  in ai-workspace/package.json:
#       "@custom-wysiwyg/core": "file:../custom-wysiwyg-editor/packages/core"
#    b) npm link:
cd packages/core && npm link
cd ../../../ai-workspace && npm link @custom-wysiwyg/core

# 4. Smoke the contract from ai-workspace (before any gravity logic):
node -e "
  const { Editor } = require('@custom-wysiwyg/core');   // or import in ESM
  console.log(typeof Editor)                            // 'function' → link works
"
```

First integration milestone (30 min of code, no gravity logic yet):
a script in ai-workspace that (1) opens the demo page or constructs an
`Editor` in jsdom/happy-dom, (2) subscribes to `change`, (3) logs
`serializeMarkdown(doc)` on every edit, (4) applies one hardcoded `transact`
edit. When that round-trips, the pipe is proven and gravity logic can drop in.

## 5. Sequence

1. ✅ Editor-side contract (`transact`, events, exporters) — shipped on this branch
2. ⬜ Approve `ai-workspace` access (or run the local link test above yourself)
3. ⬜ Fill §3 answers; confirm adapter API naming
4. ⬜ Build `@custom-wysiwyg/gravity-adapter` + round-trip smoke test
5. ⬜ First real gravity pass driving `transact` edits in the demo
