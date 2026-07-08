import type { BlockNode, DocNode, TextSpan } from '@custom-wysiwyg/core'
import { getMark, hasMarkType } from '@custom-wysiwyg/core'

/**
 * Serializes documents to clean semantic HTML. Works on the model only — no
 * DOM required — so it runs identically in the browser, Node, and React
 * Server Components.
 */

export function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function serializeSpanToHTML(span: TextSpan): string {
  let out = escapeHTML(span.text)
  if (hasMarkType(span.marks, 'code')) out = `<code>${out}</code>`
  if (hasMarkType(span.marks, 'italic')) out = `<em>${out}</em>`
  if (hasMarkType(span.marks, 'bold')) out = `<strong>${out}</strong>`
  const link = getMark(span.marks, 'link')
  if (link) out = `<a href="${escapeHTML(link.attrs.href)}">${out}</a>`
  return out
}

export function serializeInlineToHTML(spans: TextSpan[]): string {
  return spans.map(serializeSpanToHTML).join('')
}

export function serializeBlockToHTML(block: BlockNode): string {
  const tag = block.type === 'heading' ? `h${block.attrs.level}` : 'p'
  const align = block.attrs?.align
  const style = align && align !== 'left' ? ` style="text-align: ${align}"` : ''
  const content = serializeInlineToHTML(block.content)
  const own = `<${tag}${style}>${content}</${tag}>`
  if (!block.children || block.children.length === 0) return own
  const nested = block.children.map(serializeBlockToHTML).join('\n')
  return `${own}\n<div class="cwe-children">\n${nested}\n</div>`
}

export function serializeHTML(docNode: DocNode): string {
  return docNode.children.map(serializeBlockToHTML).join('\n')
}
