import type { BlockNode, DocNode, ListItemNode, TextSpan } from '@custom-wysiwyg/core'
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

function alignStyle(block: BlockNode): string {
  const align = block.attrs?.align
  return align && align !== 'left' ? ` style="text-align: ${align}"` : ''
}

function serializeListItemToHTML(item: ListItemNode): string {
  const own = serializeInlineToHTML(item.content)
  if (!item.children || item.children.length === 0) return `<li${alignStyle(item)}>${own}</li>`
  return `<li${alignStyle(item)}>${own}\n${serializeBlocksToHTML(item.children)}\n</li>`
}

export function serializeBlockToHTML(block: BlockNode): string {
  if (block.type === 'listItem') {
    // A lone list item still needs a valid list wrapper.
    return serializeBlocksToHTML([block])
  }
  const tag = block.type === 'heading' ? `h${block.attrs.level}` : 'p'
  const content = serializeInlineToHTML(block.content)
  const own = `<${tag}${alignStyle(block)}>${content}</${tag}>`
  if (!block.children || block.children.length === 0) return own
  const nested = serializeBlocksToHTML(block.children)
  return `${own}\n<div class="cwe-children">\n${nested}\n</div>`
}

/**
 * Serializes a sibling run of blocks, grouping consecutive list items of the
 * same kind into a single <ul>/<ol>.
 */
export function serializeBlocksToHTML(blocks: BlockNode[]): string {
  const out: string[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]!
    if (block.type === 'listItem') {
      const kind = block.attrs.kind
      const tag = kind === 'bullet' ? 'ul' : 'ol'
      const items: string[] = []
      while (i < blocks.length) {
        const candidate = blocks[i]!
        if (candidate.type !== 'listItem' || candidate.attrs.kind !== kind) break
        items.push(serializeListItemToHTML(candidate))
        i++
      }
      out.push(`<${tag}>\n${items.join('\n')}\n</${tag}>`)
    } else {
      out.push(serializeBlockToHTML(block))
      i++
    }
  }
  return out.join('\n')
}

export function serializeHTML(docNode: DocNode): string {
  return serializeBlocksToHTML(docNode.children)
}
