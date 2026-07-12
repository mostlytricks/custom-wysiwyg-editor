# @custom-wysiwyg/agent-adapter

The agent seam for [`@custom-wysiwyg/core`](https://www.npmjs.com/package/@custom-wysiwyg/core):
give any agent (LLM or otherwise) the document as Markdown, and let it edit
through the same undoable command door as keystrokes.

```bash
npm install @custom-wysiwyg/agent-adapter
```

```ts
import { connectAgent } from '@custom-wysiwyg/agent-adapter'

const agent = connectAgent(editor)

agent.getContext()                      // { markdown, selection, selectedText }
agent.onContext(ctx => …)               // debounced updates
agent.applyMarkdown('## Done', 'append') // one undo step, origin 'agent'

const writer = agent.createStreamWriter('insert')
for await (const chunk of llmStream) writer.write(chunk)  // block-buffered
writer.close()
```

Every edit is a single transaction the user can Ctrl+Z; the adapter is
agent-agnostic — wire it to any API or MCP tool.

Part of the [custom-wysiwyg-editor](https://github.com/mostlytricks/custom-wysiwyg-editor)
family. MIT licensed.
