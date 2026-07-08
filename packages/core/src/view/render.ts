import type { BlockNode, TextSpan } from '../model/types'
import { getMark, hasMarkType } from '../model/spans'

/**
 * Rendering is one-way: model → DOM. The DOM is never read back as content
 * (only selection positions are read), so browser quirks in contenteditable
 * markup can't leak into the document.
 */

function wrap(documentRef: Document, tag: string, child: Node): HTMLElement {
  const el = documentRef.createElement(tag)
  el.appendChild(child)
  return el
}

export function renderSpan(documentRef: Document, span: TextSpan): Node {
  let node: Node = documentRef.createTextNode(span.text)
  if (hasMarkType(span.marks, 'code')) node = wrap(documentRef, 'code', node)
  if (hasMarkType(span.marks, 'italic')) node = wrap(documentRef, 'em', node)
  if (hasMarkType(span.marks, 'bold')) node = wrap(documentRef, 'strong', node)
  const link = getMark(span.marks, 'link')
  if (link) {
    const a = documentRef.createElement('a')
    a.setAttribute('href', link.attrs.href)
    a.appendChild(node)
    node = a
  }
  return node
}

export function renderBlock(documentRef: Document, block: BlockNode, index: number): HTMLElement {
  const tag = block.type === 'heading' ? `h${block.attrs.level}` : 'p'
  const el = documentRef.createElement(tag)
  el.setAttribute('data-block', String(index))
  const align = block.attrs?.align
  if (align && align !== 'left') el.style.textAlign = align
  if (block.children.length === 0) {
    // A <br> keeps the empty block selectable and gives it height.
    el.appendChild(documentRef.createElement('br'))
  } else {
    for (const span of block.children) el.appendChild(renderSpan(documentRef, span))
  }
  return el
}
