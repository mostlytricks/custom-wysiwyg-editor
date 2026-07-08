import type { BlockNode, DocNode, TextSpan } from '@custom-wysiwyg/core'
import { getMark, hasMarkType } from '@custom-wysiwyg/core'
import { escapeHTML, serializeBlockToHTML, spanStyle } from '@custom-wysiwyg/export-html'

export interface MarkdownSerializeOptions {
  /**
   * Markdown has no syntax for text alignment. 'html' (default) emits aligned
   * blocks as inline HTML — CommonMark-legal and rendered by GitHub and most
   * renderers. 'plain' drops the alignment and emits normal Markdown.
   */
  alignedBlocks?: 'html' | 'plain'
  /**
   * Colored/highlighted/sized text has no Markdown syntax either. 'html'
   * (default) wraps styled runs in an inline <span style>; 'plain' drops the
   * styling and emits clean Markdown.
   */
  styledText?: 'html' | 'plain'
}

/** Escape characters that would otherwise be parsed as inline Markdown. */
function escapeInline(value: string): string {
  return value.replace(/([\\`*_[\]])/g, '\\$1')
}

/** Escape leading characters that would turn a paragraph into another block type. */
function escapeBlockStart(value: string): string {
  return value.replace(/^(#{1,6} |> |[-+*] )/, '\\$1').replace(/^(\d+)([.)] )/, '$1\\$2')
}

function serializeCodeSpan(content: string): string {
  // The fence must be longer than any backtick run inside the code.
  const runs = content.match(/`+/g)
  const longest = runs ? Math.max(...runs.map((run) => run.length)) : 0
  const fence = '`'.repeat(longest + 1)
  const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${content}${pad}${fence}`
}

export function serializeSpanToMarkdown(span: TextSpan, options: MarkdownSerializeOptions = {}): string {
  let out: string
  if (hasMarkType(span.marks, 'code')) {
    out = serializeCodeSpan(span.text)
  } else {
    // Emphasis delimiters must hug non-whitespace, so leading/trailing
    // whitespace is lifted outside the markers.
    const escaped = escapeInline(span.text)
    const match = escaped.match(/^(\s*)([\s\S]*?)(\s*)$/)
    const [, lead = '', body = '', trail = ''] = match ?? []
    let wrapped = body
    if (body) {
      if (hasMarkType(span.marks, 'italic')) wrapped = `*${wrapped}*`
      if (hasMarkType(span.marks, 'bold')) wrapped = `**${wrapped}**`
    }
    out = `${lead}${wrapped}${trail}`
  }
  if (options.styledText !== 'plain') {
    const style = spanStyle(span)
    if (style) out = `<span style="${escapeHTML(style)}">${out}</span>`
  }
  const link = getMark(span.marks, 'link')
  if (link) out = `[${out}](${link.attrs.href})`
  return out
}

export function serializeInlineToMarkdown(spans: TextSpan[], options: MarkdownSerializeOptions = {}): string {
  return spans.map((span) => serializeSpanToMarkdown(span, options)).join('')
}

function serializeOwnLine(block: BlockNode, options: MarkdownSerializeOptions): string {
  const align = block.attrs?.align
  if (align && align !== 'left' && options.alignedBlocks !== 'plain' && block.type !== 'listItem') {
    return serializeBlockToHTML({ ...block, children: undefined })
  }
  if (block.type === 'heading') return `${'#'.repeat(block.attrs.level)} ${serializeInlineToMarkdown(block.content, options)}`
  return escapeBlockStart(serializeInlineToMarkdown(block.content, options))
}

/**
 * Serializes a sibling run of blocks. Consecutive list items join with a
 * single newline (a tight list); everything else separates with a blank
 * line. Ordered items number themselves 1..n per consecutive run; a list
 * item's children indent to its content column, per CommonMark.
 */
function serializeBlockSequence(blocks: BlockNode[], options: MarkdownSerializeOptions, indent: string): string {
  const parts: Array<{ text: string; list: boolean }> = []
  let ordinal = 0
  for (const block of blocks) {
    if (block.type === 'listItem') {
      ordinal = block.attrs.kind === 'ordered' ? ordinal + 1 : 0
      const marker = block.attrs.kind === 'ordered' ? `${ordinal}. ` : '- '
      let text = `${indent}${marker}${serializeInlineToMarkdown(block.content, options)}`
      if (block.children && block.children.length > 0) {
        text += '\n' + serializeBlockSequence(block.children, options, indent + ' '.repeat(marker.length))
      }
      parts.push({ text, list: true })
    } else {
      ordinal = 0
      let text = indent + serializeOwnLine(block, options)
      if (block.children && block.children.length > 0) {
        // Markdown has no syntax for generic (non-list) block nesting;
        // nested children flatten to siblings at the same indent.
        text += '\n\n' + serializeBlockSequence(block.children, options, indent)
      }
      parts.push({ text, list: false })
    }
  }
  let out = ''
  parts.forEach((part, i) => {
    if (i === 0) out = part.text
    else out += (part.list && parts[i - 1]!.list ? '\n' : '\n\n') + part.text
  })
  return out
}

export function serializeBlockToMarkdown(block: BlockNode, options: MarkdownSerializeOptions = {}): string {
  return serializeBlockSequence([block], options, '')
}

export function serializeMarkdown(docNode: DocNode, options: MarkdownSerializeOptions = {}): string {
  return serializeBlockSequence(docNode.children, options, '')
}
