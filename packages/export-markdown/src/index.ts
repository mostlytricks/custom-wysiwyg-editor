import type { BlockNode, DocNode, TextSpan } from '@custom-wysiwyg/core'
import { getMark, hasMarkType } from '@custom-wysiwyg/core'
import { serializeBlockToHTML } from '@custom-wysiwyg/export-html'

export interface MarkdownSerializeOptions {
  /**
   * Markdown has no syntax for text alignment. 'html' (default) emits aligned
   * blocks as inline HTML — CommonMark-legal and rendered by GitHub and most
   * renderers. 'plain' drops the alignment and emits normal Markdown.
   */
  alignedBlocks?: 'html' | 'plain'
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

export function serializeSpanToMarkdown(span: TextSpan): string {
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
  const link = getMark(span.marks, 'link')
  if (link) out = `[${out}](${link.attrs.href})`
  return out
}

export function serializeInlineToMarkdown(spans: TextSpan[]): string {
  return spans.map(serializeSpanToMarkdown).join('')
}

export function serializeBlockToMarkdown(block: BlockNode, options: MarkdownSerializeOptions = {}): string {
  const align = block.attrs?.align
  if (align && align !== 'left' && options.alignedBlocks !== 'plain') {
    return serializeBlockToHTML(block)
  }
  const inline = serializeInlineToMarkdown(block.children)
  if (block.type === 'heading') {
    return `${'#'.repeat(block.attrs.level)} ${inline}`
  }
  return escapeBlockStart(inline)
}

export function serializeMarkdown(docNode: DocNode, options: MarkdownSerializeOptions = {}): string {
  return docNode.children.map((block) => serializeBlockToMarkdown(block, options)).join('\n\n')
}
