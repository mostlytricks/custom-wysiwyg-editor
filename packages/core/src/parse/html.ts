import type { Alignment, BlockNode, FontSizeToken, ListKind, Mark, TextSpan } from '../model/types'
import { FONT_SIZES } from '../model/types'
import { normalizeSpans } from '../model/spans'

/**
 * Best-effort HTML → model parser: the inverse of the view/HTML exporter.
 * Used for rich paste and for loading saved HTML. Unknown elements flatten
 * into their children; unknown styling is dropped rather than guessed.
 */

const SIZE_BY_CSS: Record<string, FontSizeToken> = Object.fromEntries(
  Object.entries(FONT_SIZES).map(([token, css]) => [css, token as FontSizeToken]),
) as Record<string, FontSizeToken>

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === 1
}

function alignOf(el: HTMLElement): Alignment | undefined {
  const align = el.style?.textAlign || el.getAttribute('align') || ''
  return align === 'center' || align === 'right' || align === 'justify' ? align : undefined
}

function pushMark(marks: Mark[], mark: Mark): Mark[] {
  return [...marks.filter((m) => m.type !== mark.type), mark]
}

function marksForElement(el: HTMLElement, marks: Mark[]): Mark[] {
  const tag = el.tagName.toLowerCase()
  let next = marks
  if (tag === 'strong' || tag === 'b') next = pushMark(next, { type: 'bold' })
  if (tag === 'em' || tag === 'i') next = pushMark(next, { type: 'italic' })
  if (tag === 'code') next = pushMark(next, { type: 'code' })
  if (tag === 'a') {
    const href = el.getAttribute('href')
    if (href) next = pushMark(next, { type: 'link', attrs: { href } })
  }
  const style = el.style
  if (style) {
    if (style.color) next = pushMark(next, { type: 'color', attrs: { value: style.color } })
    if (style.backgroundColor) next = pushMark(next, { type: 'highlight', attrs: { value: style.backgroundColor } })
    const size = SIZE_BY_CSS[style.fontSize]
    if (size) next = pushMark(next, { type: 'fontSize', attrs: { value: size } })
  }
  return next
}

/** Inline content of an element: text runs with accumulated marks, whitespace collapsed. */
function parseInline(container: Node, marks: Mark[] = []): TextSpan[] {
  const spans: TextSpan[] = []
  container.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      const collapsed = (node.nodeValue ?? '').replace(/\s+/g, ' ')
      if (collapsed) spans.push({ type: 'text', text: collapsed, marks })
      return
    }
    if (!isElement(node)) return
    if (node.tagName.toLowerCase() === 'br') {
      spans.push({ type: 'text', text: '\n', marks })
      return
    }
    spans.push(...parseInline(node, marksForElement(node, marks)))
  })
  return spans
}

function trimSpans(spans: TextSpan[]): TextSpan[] {
  const out = normalizeSpans(spans)
  if (out.length > 0) {
    out[0] = { ...out[0]!, text: out[0]!.text.replace(/^\s+/, '') }
    const last = out.length - 1
    out[last] = { ...out[last]!, text: out[last]!.text.replace(/\s+$/, '') }
  }
  return normalizeSpans(out)
}

/** Direct element children matching one of `tags` (no :scope — happy-dom lacks it). */
function childElements(el: HTMLElement, ...tags: string[]): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
    if (tags.length === 0 || tags.includes(child.tagName.toLowerCase())) out.push(child as HTMLElement)
  }
  return out
}

function parseListItem(li: HTMLElement, kind: ListKind): BlockNode {
  // A leading checkbox input marks a to-do item (matches the HTML exporter).
  const checkbox = childElements(li, 'input').find((input) => input.getAttribute('type') === 'checkbox')
  const inlineHolder = li.cloneNode(true) as HTMLElement
  // Nested lists become children; remove them from the inline copy.
  const nested: BlockNode[] = []
  childElements(inlineHolder, 'ul', 'ol').forEach((childList) => childList.remove())
  childElements(li, 'ul', 'ol').forEach((childList) => {
    nested.push(...parseBlockElement(childList))
  })
  inlineHolder.querySelectorAll('input').forEach((input) => input.remove())
  const content = trimSpans(parseInline(inlineHolder))
  const align = alignOf(li)
  if (checkbox) {
    return {
      type: 'todo',
      attrs: { checked: checkbox.hasAttribute('checked'), ...(align ? { align } : {}) },
      content,
      ...(nested.length > 0 ? { children: nested } : {}),
    }
  }
  return {
    type: 'listItem',
    attrs: { kind, ...(align ? { align } : {}) },
    content,
    ...(nested.length > 0 ? { children: nested } : {}),
  }
}

function parseTable(tableEl: HTMLElement): BlockNode {
  const rows: BlockNode[] = []
  const columnAligns: Alignment[] = []
  const trs: HTMLElement[] = childElements(tableEl).flatMap((child) => {
    const tag = child.tagName.toLowerCase()
    if (tag === 'tr') return [child]
    if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') return childElements(child, 'tr')
    return []
  })
  trs.forEach((tr) => {
    const cells: BlockNode[] = []
    childElements(tr, 'th', 'td').forEach((cell, index) => {
      const align = alignOf(cell)
      if (align && !columnAligns[index]) columnAligns[index] = align
      cells.push({ type: 'tableCell', content: trimSpans(parseInline(cell)) })
    })
    if (cells.length > 0) rows.push({ type: 'tableRow', content: [], children: cells })
  })
  const hasAligns = columnAligns.some(Boolean)
  return {
    type: 'table',
    ...(hasAligns
      ? { attrs: { columnAligns: rows[0]!.children!.map((_, i) => columnAligns[i] ?? 'left') } }
      : {}),
    content: [],
    children: rows,
  }
}

function parseBlockElement(el: HTMLElement): BlockNode[] {
  const tag = el.tagName.toLowerCase()
  const align = alignOf(el)
  // The attrs merge isn't provable across the union, but every member's attrs
  // accept an optional align — hence the localized cast.
  const withAlign = (block: BlockNode): BlockNode =>
    align ? ({ ...block, attrs: { ...(block.attrs ?? {}), align } } as BlockNode) : block

  switch (tag) {
    case 'p':
      return [withAlign({ type: 'paragraph', content: trimSpans(parseInline(el)) })]
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Math.min(3, Number(tag[1])) as 1 | 2 | 3
      return [{ type: 'heading', attrs: { level, ...(align ? { align } : {}) }, content: trimSpans(parseInline(el)) }]
    }
    case 'ul':
    case 'ol': {
      const kind: ListKind = tag === 'ul' ? 'bullet' : 'ordered'
      return childElements(el, 'li').map((li) => parseListItem(li, kind))
    }
    case 'blockquote': {
      const inner = parseBlocks(el)
      if (inner.length === 0) return [{ type: 'quote', content: trimSpans(parseInline(el)) }]
      const [first, ...rest] = inner
      const content = first!.type === 'paragraph' ? first!.content : []
      const children = first!.type === 'paragraph' ? rest : inner
      return [withAlign({ type: 'quote', content, ...(children.length > 0 ? { children } : {}) })]
    }
    case 'pre': {
      const code = el.querySelector('code')
      const language = /language-([\w-]+)/.exec(code?.className ?? '')?.[1]
      const textContent = (code ?? el).textContent ?? ''
      return [
        {
          type: 'codeBlock',
          ...(language ? { attrs: { language } } : {}),
          content: textContent ? [{ type: 'text', text: textContent.replace(/\n$/, ''), marks: [] }] : [],
        },
      ]
    }
    case 'hr':
      return [{ type: 'divider', content: [] }]
    case 'aside': {
      const spans = trimSpans(parseInline(el))
      // The exporter prefixes the emoji into the text: "💡 content".
      const first = spans[0]
      const match = first ? /^(\p{Extended_Pictographic}(?:️)?)\s*/u.exec(first.text) : null
      const emoji = match?.[1]
      if (emoji && first) spans[0] = { ...first, text: first.text.slice(match![0].length) }
      return [
        withAlign({
          type: 'callout',
          attrs: { ...(emoji ? { emoji } : {}) },
          content: normalizeSpans(spans),
        }),
      ]
    }
    case 'table':
      return [parseTable(el)]
    case 'br':
      return []
    default:
      // Unknown containers (div, section, span at block level, …) flatten.
      return parseBlocks(el)
  }
}

const INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'code', 'a', 'span', 'u', 's', 'small', 'sub', 'sup'])

/** Parses the children of `container` into blocks; loose inline runs become paragraphs. */
export function parseBlocks(container: Node): BlockNode[] {
  const blocks: BlockNode[] = []
  let inlineRun: Node[] = []

  const flushInline = (): void => {
    if (inlineRun.length === 0) return
    const spans: TextSpan[] = []
    for (const node of inlineRun) {
      if (node.nodeType === 3) {
        const collapsed = (node.nodeValue ?? '').replace(/\s+/g, ' ')
        if (collapsed) spans.push({ type: 'text', text: collapsed, marks: [] })
      } else if (isElement(node)) {
        spans.push(...parseInline(node, marksForElement(node, [])))
      }
    }
    const content = trimSpans(spans)
    if (content.length > 0) blocks.push({ type: 'paragraph', content })
    inlineRun = []
  }

  container.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      if ((node.nodeValue ?? '').trim()) inlineRun.push(node)
      return
    }
    if (!isElement(node)) return
    if (INLINE_TAGS.has(node.tagName.toLowerCase())) {
      inlineRun.push(node)
      return
    }
    flushInline()
    blocks.push(...parseBlockElement(node))
  })
  flushInline()
  return blocks
}

/**
 * Parses an HTML string into blocks. Pass the editor's document so the right
 * DOMParser is used (defaults to the global one).
 */
export function parseHTML(html: string, documentRef?: Document): BlockNode[] {
  const ParserCtor = (documentRef?.defaultView?.DOMParser ?? globalThis.DOMParser) as typeof DOMParser
  const parsed = new ParserCtor().parseFromString(html, 'text/html')
  return parseBlocks(parsed.body)
}
