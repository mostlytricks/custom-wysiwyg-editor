import type { BlockNode, TextSpan } from '../model/types'
import type { BlockPath } from '../model/path'
import { getMark, hasMarkType } from '../model/spans'

/**
 * Rendering is one-way: model → DOM. The DOM is never read back as content
 * (only selection positions are read), so browser quirks in contenteditable
 * markup can't leak into the document.
 *
 * Each block's own text lives in an element tagged data-path ("0", "0.1", …).
 * Nested children render *outside* that element (in a sibling wrapper), so
 * collecting a block's text nodes never leaks a child block's text.
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

export function pathToAttr(path: BlockPath): string {
  return path.join('.')
}

export function attrToPath(attr: string): BlockPath | null {
  if (!/^\d+(\.\d+)*$/.test(attr)) return null
  return attr.split('.').map(Number)
}

export function renderBlock(documentRef: Document, block: BlockNode, path: BlockPath): HTMLElement {
  const tag = block.type === 'heading' ? `h${block.attrs.level}` : 'p'
  const el = documentRef.createElement(tag)
  el.setAttribute('data-path', pathToAttr(path))
  const align = block.attrs?.align
  if (align && align !== 'left') el.style.textAlign = align
  if (block.content.length === 0) {
    // A <br> keeps the empty block selectable and gives it height.
    el.appendChild(documentRef.createElement('br'))
  } else {
    for (const span of block.content) el.appendChild(renderSpan(documentRef, span))
  }
  if (!block.children || block.children.length === 0) return el

  const group = documentRef.createElement('div')
  group.className = 'cwe-block-group'
  group.appendChild(el)
  const childrenEl = documentRef.createElement('div')
  childrenEl.className = 'cwe-children'
  block.children.forEach((child, i) => {
    childrenEl.appendChild(renderBlock(documentRef, child, [...path, i]))
  })
  group.appendChild(childrenEl)
  return group
}
