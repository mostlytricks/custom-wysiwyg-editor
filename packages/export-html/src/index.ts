import type { BlockNode, DocNode, ListItemNode, TextSpan, TodoNode } from '@custom-wysiwyg/core'
import { blockText, DEFAULT_CALLOUT_EMOJI, FONT_SIZES, getMark, hasMarkType } from '@custom-wysiwyg/core'

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

/** Combined inline style for the span's valued style marks, or ''. */
export function spanStyle(span: TextSpan): string {
  const declarations: string[] = []
  const color = getMark(span.marks, 'color')
  if (color) declarations.push(`color: ${color.attrs.value}`)
  const highlight = getMark(span.marks, 'highlight')
  if (highlight) declarations.push(`background-color: ${highlight.attrs.value}`)
  const fontSize = getMark(span.marks, 'fontSize')
  if (fontSize) declarations.push(`font-size: ${FONT_SIZES[fontSize.attrs.value]}`)
  return declarations.join('; ')
}

export function serializeSpanToHTML(span: TextSpan): string {
  let out = escapeHTML(span.text)
  if (hasMarkType(span.marks, 'code')) out = `<code>${out}</code>`
  if (hasMarkType(span.marks, 'italic')) out = `<em>${out}</em>`
  if (hasMarkType(span.marks, 'bold')) out = `<strong>${out}</strong>`
  const style = spanStyle(span)
  if (style) out = `<span style="${escapeHTML(style)}">${out}</span>`
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

function serializeTodoToHTML(item: TodoNode): string {
  const box = `<input type="checkbox" disabled${item.attrs.checked ? ' checked' : ''}> `
  const own = box + serializeInlineToHTML(item.content)
  if (!item.children || item.children.length === 0) return `<li${alignStyle(item)}>${own}</li>`
  return `<li${alignStyle(item)}>${own}\n${serializeBlocksToHTML(item.children)}\n</li>`
}

export function serializeBlockToHTML(block: BlockNode): string {
  if (block.type === 'listItem' || block.type === 'todo') {
    // A lone item still needs a valid list wrapper.
    return serializeBlocksToHTML([block])
  }
  if (block.type === 'divider') return '<hr>'
  if (block.type === 'codeBlock') {
    const language = block.attrs?.language
    const classAttr = language ? ` class="language-${escapeHTML(language)}"` : ''
    return `<pre><code${classAttr}>${escapeHTML(blockText(block))}</code></pre>`
  }
  const nested = block.children && block.children.length > 0 ? serializeBlocksToHTML(block.children) : null
  if (block.type === 'callout') {
    const emoji = escapeHTML(block.attrs?.emoji ?? DEFAULT_CALLOUT_EMOJI)
    const own = `<aside class="cwe-callout"${alignStyle(block)}>${emoji} ${serializeInlineToHTML(block.content)}`
    return nested ? `${own}\n${nested}\n</aside>` : `${own}</aside>`
  }
  if (block.type === 'quote') {
    const own = `<blockquote${alignStyle(block)}>${serializeInlineToHTML(block.content)}`
    return nested ? `${own}\n${nested}\n</blockquote>` : `${own}</blockquote>`
  }
  const tag = block.type === 'heading' ? `h${block.attrs.level}` : 'p'
  const own = `<${tag}${alignStyle(block)}>${serializeInlineToHTML(block.content)}</${tag}>`
  if (!nested) return own
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
    } else if (block.type === 'todo') {
      const items: string[] = []
      while (i < blocks.length && blocks[i]!.type === 'todo') {
        items.push(serializeTodoToHTML(blocks[i] as TodoNode))
        i++
      }
      out.push(`<ul class="cwe-todos">\n${items.join('\n')}\n</ul>`)
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
