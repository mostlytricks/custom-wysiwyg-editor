import type { HeadingAttrs, HeadingLevel, Mark } from './model/types'
import { collapsedSelection, selectionIsCollapsed } from './model/position'
import { blockText } from './model/spans'
import { blockAt, replaceBlockAt } from './model/path'
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
  const block = blockAt(state.doc, head.path)
  if (!block) return null
  const textBefore = blockText(block).slice(0, head.offset)

  // Block rule: "# ", "## ", "### " at the start of a paragraph.
  if (insertedText === ' ' && block.type === 'paragraph') {
    const match = HEADING_PREFIX.exec(textBefore.slice(0, -1))
    if (match && match[1]) {
      const level = match[1].length as HeadingLevel
      const withoutPrefix = deleteRangeInDoc(
        state.doc,
        { path: head.path, offset: 0 },
        { path: head.path, offset: textBefore.length },
      )
      const target = blockAt(withoutPrefix, head.path)
      if (!target) return null
      const attrs: HeadingAttrs = { level, ...(target.attrs?.align ? { align: target.attrs.align } : {}) }
      const docNode = replaceBlockAt(withoutPrefix, head.path, (current) => ({
        type: 'heading',
        attrs,
        content: current.content,
        ...(current.children ? { children: current.children } : {}),
      }))
      return {
        doc: docNode,
        selection: collapsedSelection({ path: head.path, offset: 0 }),
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
    let docNode = deleteRangeInDoc(state.doc, { path: head.path, offset: start }, { path: head.path, offset: head.offset })
    docNode = insertTextInDoc(docNode, { path: head.path, offset: start }, inner, [rule.mark])
    return {
      doc: docNode,
      selection: collapsedSelection({ path: head.path, offset: start + inner.length }),
      // Typing continues unformatted after an autoformat, matching Notion.
      storedMarks: [],
    }
  }

  return null
}
