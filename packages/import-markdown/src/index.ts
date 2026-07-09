import type { Alignment, BlockNode, DocNode, HeadingLevel, Mark, TextSpan } from '@custom-wysiwyg/core'
import { normalizeSpans } from '@custom-wysiwyg/core'

/**
 * Markdown → model parser for the GFM subset the editor exports: headings,
 * paragraphs, bullet/ordered lists (nested), task lists, quotes (incl. the
 * emoji-quote callout form), fenced code, dividers, tables, and the inline
 * marks bold/italic/code/link. Inline HTML (styled spans, aligned blocks) is
 * treated as plain text — styling degrades explicitly, exactly like the
 * exporter's `styledText: 'plain'` mode.
 */

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

function findClosing(source: string, marker: string, from: number): number {
  let i = from
  while (i < source.length) {
    const at = source.indexOf(marker, i)
    if (at === -1) return -1
    if (source[at - 1] === '\\') {
      i = at + 1
      continue
    }
    // A lone '*' must not match the start of a '**'.
    if (marker === '*' && source[at + 1] === '*' && source[at - 1] !== '*') {
      i = at + 2
      continue
    }
    return at
  }
  return -1
}

export function parseInlineMarkdown(source: string, marks: Mark[] = []): TextSpan[] {
  const spans: TextSpan[] = []
  let buffer = ''
  const flush = (): void => {
    if (buffer) spans.push({ type: 'text', text: buffer, marks })
    buffer = ''
  }

  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    if (ch === '\\' && i + 1 < source.length) {
      buffer += source[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      const run = /^`+/.exec(source.slice(i))![0]
      const close = source.indexOf(run, i + run.length)
      if (close !== -1) {
        flush()
        const inner = source.slice(i + run.length, close).replace(/^ (.*) $/, '$1')
        spans.push({ type: 'text', text: inner, marks: [...marks, { type: 'code' }] })
        i = close + run.length
        continue
      }
    }
    if (source.startsWith('**', i)) {
      const close = findClosing(source, '**', i + 2)
      if (close !== -1) {
        flush()
        spans.push(...parseInlineMarkdown(source.slice(i + 2, close), [...marks, { type: 'bold' }]))
        i = close + 2
        continue
      }
    }
    if (ch === '*') {
      const close = findClosing(source, '*', i + 1)
      if (close !== -1) {
        flush()
        spans.push(...parseInlineMarkdown(source.slice(i + 1, close), [...marks, { type: 'italic' }]))
        i = close + 1
        continue
      }
    }
    if (ch === '[') {
      const match = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(source.slice(i))
      if (match) {
        flush()
        spans.push(...parseInlineMarkdown(match[1]!, [...marks, { type: 'link', attrs: { href: match[2]! } }]))
        i += match[0].length
        continue
      }
    }
    buffer += ch
    i++
  }
  flush()
  return normalizeSpans(spans)
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const FENCE = /^(`{3,})\s*([\w-]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const LIST_ITEM = /^(\s*)(?:([-*])|(\d{1,9})\.)\s+(?:\[( |x)\]\s+)?(.*)$/
const DIVIDER = /^-{3,}\s*$/
const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/
const QUOTE = /^>\s?(.*)$/
const CALLOUT_EMOJI = /^(\p{Extended_Pictographic}(?:️)?)\s+/u

function alignFromSeparator(token: string): Alignment {
  const trimmed = token.trim()
  const left = trimmed.startsWith(':')
  const right = trimmed.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  return 'left'
}

function splitRow(line: string): string[] {
  const inner = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
  const cells: string[] = []
  let buffer = ''
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (ch === '\\' && inner[i + 1] === '|') {
      buffer += '|'
      i++
    } else if (ch === '|') {
      cells.push(buffer.trim())
      buffer = ''
    } else {
      buffer += ch
    }
  }
  cells.push(buffer.trim())
  return cells
}

export function parseMarkdownBlocks(lines: string[]): BlockNode[] {
  const blocks: BlockNode[] = []
  // Stack of open list items: parent for anything indented past `indent`.
  const listStack: Array<{ indent: number; node: BlockNode }> = []
  let paragraphRun: string[] = []

  const flushParagraph = (): void => {
    if (paragraphRun.length === 0) return
    blocks.push({ type: 'paragraph', content: parseInlineMarkdown(paragraphRun.join(' ')) })
    paragraphRun = []
  }
  const closeLists = (): void => {
    listStack.length = 0
  }
  const pushBlock = (block: BlockNode): void => {
    flushParagraph()
    closeLists()
    blocks.push(block)
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]!

    const fence = FENCE.exec(line.trim())
    if (fence) {
      flushParagraph()
      closeLists()
      const indent = line.length - line.trimStart().length
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) {
        body.push(lines[i]!.slice(indent))
        i++
      }
      i++ // closing fence
      const code = body.join('\n')
      blocks.push({
        type: 'codeBlock',
        ...(fence[2] ? { attrs: { language: fence[2] } } : {}),
        content: code ? [{ type: 'text', text: code, marks: [] }] : [],
      })
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      closeLists()
      i++
      continue
    }

    // Table: a pipe row followed by a separator row.
    if (line.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]!.trim()) && lines[i + 1]!.includes('|')) {
      flushParagraph()
      closeLists()
      const header = splitRow(line)
      const aligns = splitRow(lines[i + 1]!).map(alignFromSeparator)
      const rows: string[][] = [header]
      i += 2
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        rows.push(splitRow(lines[i]!))
        i++
      }
      const hasAligns = aligns.some((a) => a !== 'left')
      blocks.push({
        type: 'table',
        ...(hasAligns ? { attrs: { columnAligns: aligns } } : {}),
        content: [],
        children: rows.map((cells) => ({
          type: 'tableRow' as const,
          content: [],
          children: cells.map((cell) => ({ type: 'tableCell' as const, content: parseInlineMarkdown(cell) })),
        })),
      })
      continue
    }

    if (DIVIDER.test(line.trim())) {
      pushBlock({ type: 'divider', content: [] })
      i++
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const level = Math.min(3, heading[1]!.length) as HeadingLevel
      pushBlock({ type: 'heading', attrs: { level }, content: parseInlineMarkdown(heading[2]!) })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      flushParagraph()
      closeLists()
      const stripped: string[] = []
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        stripped.push(QUOTE.exec(lines[i]!)![1]!)
        i++
      }
      const inner = parseMarkdownBlocks(stripped)
      const [first, ...rest] = inner
      const content = first && first.type === 'paragraph' ? first.content : []
      const children = first && first.type === 'paragraph' ? rest : inner
      // The exporter writes callouts as "> 💡 text".
      const emojiMatch = content[0] ? CALLOUT_EMOJI.exec(content[0].text) : null
      if (emojiMatch) {
        const trimmedFirst = { ...content[0]!, text: content[0]!.text.slice(emojiMatch[0].length) }
        blocks.push({
          type: 'callout',
          attrs: { emoji: emojiMatch[1]! },
          content: normalizeSpans([trimmedFirst, ...content.slice(1)]),
          ...(children.length > 0 ? { children } : {}),
        })
      } else {
        blocks.push({ type: 'quote', content, ...(children.length > 0 ? { children } : {}) })
      }
      continue
    }

    const item = LIST_ITEM.exec(line)
    if (item) {
      flushParagraph()
      const indent = item[1]!.length
      const isTodo = item[4] !== undefined
      const node: BlockNode = isTodo
        ? { type: 'todo', attrs: { checked: item[4] === 'x' }, content: parseInlineMarkdown(item[5]!) }
        : {
            type: 'listItem',
            attrs: { kind: item[2] ? 'bullet' : 'ordered' },
            content: parseInlineMarkdown(item[5]!),
          }
      while (listStack.length > 0 && indent <= listStack[listStack.length - 1]!.indent) listStack.pop()
      const parent = listStack[listStack.length - 1]
      if (parent) {
        parent.node.children = [...(parent.node.children ?? []), node]
      } else {
        blocks.push(node)
      }
      listStack.push({ indent, node })
      i++
      continue
    }

    paragraphRun.push(line.trim())
    i++
  }
  flushParagraph()
  return blocks
}

export function parseMarkdown(source: string): DocNode {
  const blocks = parseMarkdownBlocks(source.replace(/\r\n?/g, '\n').split('\n'))
  return { type: 'doc', children: blocks.length > 0 ? blocks : [{ type: 'paragraph', content: [] }] }
}
