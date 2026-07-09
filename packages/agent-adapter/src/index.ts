import type { BlockNode, DocNode, Editor, SelectionRange } from '@custom-wysiwyg/core'
import { blockText, blocksInRange, insertBlocks, orderedRange, selectAll, setSelection } from '@custom-wysiwyg/core'
import { serializeMarkdown } from '@custom-wysiwyg/export-markdown'
import { parseMarkdown, parseMarkdownBlocks } from '@custom-wysiwyg/import-markdown'

/**
 * The agent seam, packaged: everything an external agent (LLM tool,
 * collaboration layer, script) needs to read the document and apply edits
 * through the same undoable pure-command door as keystrokes.
 *
 * Walls inherited from core/SPEC.md: edits go through `transact` only —
 * never `setDoc` (nukes history), never the DOM. Streaming output is
 * buffered into block-sized transactions.
 */

export interface AgentContext {
  /** The whole document as Markdown — the cheapest faithful LLM context. */
  markdown: string
  /** The raw document, for structured access. */
  doc: DocNode
  selection: SelectionRange
  /** Plain text of the current selection ('' when collapsed). */
  selectedText: string
}

export type ApplyMode =
  /** Insert at the current selection (replacing it when non-collapsed). */
  | 'insert'
  /** Append at the end of the document. */
  | 'append'
  /** Replace the whole document — still one undoable transaction. */
  | 'replaceDocument'

export interface AgentSessionOptions {
  /** Debounce for onContext notifications (ms). Default 300. */
  contextDebounceMs?: number
}

export interface StreamWriter {
  /** Feed a chunk of agent output (any slicing — buffering is handled here). */
  write(chunk: string): void
  /** Flush whatever remains in the buffer as the final blocks. */
  end(): void
}

export class AgentSession {
  private editor: Editor
  private options: AgentSessionOptions
  private timer: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null
  private contextListeners = new Set<(context: AgentContext) => void>()

  constructor(editor: Editor, options: AgentSessionOptions = {}) {
    this.editor = editor
    this.options = options
  }

  getContext(): AgentContext {
    const state = this.editor.getState()
    const { from, to } = orderedRange(state.doc, state.selection)
    let selectedText = ''
    for (const { path, block } of blocksInRange(state.doc, from.path, to.path)) {
      const text = blockText(block)
      const start = path.join() === from.path.join() ? from.offset : 0
      const end = path.join() === to.path.join() ? to.offset : text.length
      const slice = text.slice(start, end)
      if (slice) selectedText += (selectedText ? '\n' : '') + slice
    }
    return {
      markdown: serializeMarkdown(state.doc),
      doc: state.doc,
      selection: state.selection,
      selectedText,
    }
  }

  /** Debounced document-change notifications with fresh context. */
  onContext(listener: (context: AgentContext) => void): () => void {
    this.contextListeners.add(listener)
    if (!this.unsubscribe) {
      this.unsubscribe = this.editor.on('change', () => {
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          const context = this.getContext()
          for (const cb of [...this.contextListeners]) cb(context)
        }, this.options.contextDebounceMs ?? 300)
      })
    }
    return () => this.contextListeners.delete(listener)
  }

  /** Apply agent-authored Markdown as one undoable transaction. */
  applyMarkdown(markdown: string, mode: ApplyMode = 'insert'): boolean {
    if (!markdown.trim()) return false
    return this.applyBlocks(parseMarkdown(markdown).children, mode)
  }

  /** Apply parsed blocks as one undoable transaction. */
  applyBlocks(blocks: BlockNode[], mode: ApplyMode = 'insert', options: { inline?: boolean } = {}): boolean {
    if (blocks.length === 0) return false
    return this.editor.transact((state) => {
      if (mode === 'replaceDocument') {
        return {
          doc: { type: 'doc', children: blocks },
          selection: { anchor: { path: [0], offset: 0 }, head: { path: [0], offset: 0 } },
          storedMarks: null,
        }
      }
      if (mode === 'append') {
        const atEnd = selectAll(state)
        const end = atEnd.selection.head
        return insertBlocks(setSelection(state, { anchor: end, head: end }), blocks, options)
      }
      return insertBlocks(state, blocks, options)
    }, 'agent')
  }

  /**
   * Buffers streamed agent output into block-sized transactions: complete
   * blocks (separated by blank lines) apply as they arrive; `end()` flushes
   * the tail. Each flush appends after the previous one.
   */
  createStreamWriter(mode: Exclude<ApplyMode, 'replaceDocument'> = 'append'): StreamWriter {
    let buffer = ''
    let first = true
    const flush = (upTo: number): void => {
      const complete = buffer.slice(0, upTo)
      buffer = buffer.slice(upTo)
      const blocks = parseMarkdownBlocks(complete.replace(/\r\n?/g, '\n').split('\n'))
      if (blocks.length === 0) return
      // The first flush honors the mode; later flushes continue at the caret
      // insertBlocks leaves at the end of the previous insert. Streamed
      // content is block-granular by definition — never splice inline.
      this.applyBlocks(blocks, first ? mode : 'insert', { inline: false })
      first = false
    }
    return {
      write: (chunk: string): void => {
        buffer += chunk
        const boundary = buffer.lastIndexOf('\n\n')
        if (boundary !== -1) flush(boundary + 2)
      },
      end: (): void => {
        if (buffer.trim()) flush(buffer.length)
        buffer = ''
      },
    }
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer)
    this.unsubscribe?.()
    this.unsubscribe = null
    this.contextListeners.clear()
  }
}

/** Convenience: `connectAgent(editor)` reads better at call sites than `new`. */
export function connectAgent(editor: Editor, options?: AgentSessionOptions): AgentSession {
  return new AgentSession(editor, options)
}
