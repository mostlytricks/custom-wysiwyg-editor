import type { HeadingAttrs, HeadingLevel, Mark } from './model/types'
import { collapsedSelection, selectionIsCollapsed } from './model/position'
import { blockText } from './model/spans'
import { deleteRangeInDoc, insertTextInDoc } from './commands'
import type { EditorState } from './state'

/**
 * Markdown-style input rules, applied as you type: `# ` becomes a heading,
 * `**bold**`, `*italic*`, and `` `code` `` auto-format. Rules receive the
 * state *after* the character was inserted and return a transformed state,
 * or null when nothing matches.
 */

interface MarkRule {
  /** Must end-anchor and capture the inner text as group 1. */
  pattern: RegExp
  mark: Mark
}

// Order matters: bold's ** must win before italic's * gets a chance.
const MARK_RULES: MarkRule[] = [
  { pattern: /\*\*([^*]+)\*\*$/, mark: { type: 'bold' } },
  { pattern: /(?<!\*)\*([^*\s][^*]*)\*$/, mark: { type: 'italic' } },
  { pattern: /`([^`]+)`$/, mark: { type: 'code' } },
]

const HEADING_PREFIX = /^(#{1,3})$/

export function runInputRules(state: EditorState, insertedText: string): EditorState | null {
  if (!selectionIsCollapsed(state.selection)) return null
  const head = state.selection.head
  const block = state.doc.children[head.block]
  if (!block) return null
  const textBefore = blockText(block).slice(0, head.offset)

  // Block rule: "# ", "## ", "### " at the start of a paragraph.
  if (insertedText === ' ' && block.type === 'paragraph') {
    const match = HEADING_PREFIX.exec(textBefore.slice(0, -1))
    if (match && match[1]) {
      const level = match[1].length as HeadingLevel
      const withoutPrefix = deleteRangeInDoc(
        state.doc,
        { block: head.block, offset: 0 },
        { block: head.block, offset: textBefore.length },
      )
      const target = withoutPrefix.children[head.block]
      if (!target) return null
      const attrs: HeadingAttrs = { level, ...(target.attrs?.align ? { align: target.attrs.align } : {}) }
      const children = withoutPrefix.children.slice()
      children[head.block] = { type: 'heading', attrs, children: target.children }
      return {
        doc: { ...withoutPrefix, children },
        selection: collapsedSelection({ block: head.block, offset: 0 }),
        storedMarks: null,
      }
    }
  }

  // Mark rules: replace the matched syntax with marked text.
  for (const rule of MARK_RULES) {
    const match = rule.pattern.exec(textBefore)
    const inner = match?.[1]
    if (!match || !inner || !inner.trim()) continue
    const start = head.offset - match[0].length
    let docNode = deleteRangeInDoc(state.doc, { block: head.block, offset: start }, { block: head.block, offset: head.offset })
    docNode = insertTextInDoc(docNode, { block: head.block, offset: start }, inner, [rule.mark])
    return {
      doc: docNode,
      selection: collapsedSelection({ block: head.block, offset: start + inner.length }),
      // Typing continues unformatted after an autoformat, matching Notion.
      storedMarks: [],
    }
  }

  return null
}
