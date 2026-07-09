import type { BlockNode, TextSpan } from '../model/types'
import { FONT_SIZES } from '../model/types'
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
 *
 * List markers are pure CSS (::before on data-list/data-ordinal attributes) —
 * they must never add text nodes, or selection offset mapping would break.
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
  const color = getMark(span.marks, 'color')
  const highlight = getMark(span.marks, 'highlight')
  const fontSize = getMark(span.marks, 'fontSize')
  if (color || highlight || fontSize) {
    const styled = documentRef.createElement('span')
    if (color) styled.style.color = color.attrs.value
    if (highlight) styled.style.backgroundColor = highlight.attrs.value
    if (fontSize) styled.style.fontSize = FONT_SIZES[fontSize.attrs.value]
    styled.appendChild(node)
    node = styled
  }
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

function blockTag(block: BlockNode): string {
  switch (block.type) {
    case 'heading':
      return `h${block.attrs.level}`
    case 'quote':
      return 'blockquote'
    case 'codeBlock':
      return 'pre'
    case 'divider':
      return 'hr'
    case 'paragraph':
      return 'p'
    default:
      return 'div'
  }
}

/**
 * Tables render their rows/cells inline (not in a sibling wrapper): table and
 * row own no text, so the nearest data-path ancestor of any text node is
 * still the cell — offset mapping stays intact.
 */
function renderTable(documentRef: Document, block: BlockNode, path: BlockPath): HTMLElement {
  const tableEl = documentRef.createElement('table')
  tableEl.className = 'cwe-table'
  tableEl.setAttribute('data-path', pathToAttr(path))
  const aligns = block.type === 'table' ? (block.attrs?.columnAligns ?? []) : []
  const tbody = documentRef.createElement('tbody')
  ;(block.children ?? []).forEach((row, r) => {
    const tr = documentRef.createElement('tr')
    tr.setAttribute('data-path', pathToAttr([...path, r]))
    ;(row.children ?? []).forEach((cell, c) => {
      const cellEl = documentRef.createElement(r === 0 ? 'th' : 'td')
      cellEl.setAttribute('data-path', pathToAttr([...path, r, c]))
      const align = aligns[c]
      if (align && align !== 'left') cellEl.style.textAlign = align
      if (cell.content.length === 0) cellEl.appendChild(documentRef.createElement('br'))
      else for (const span of cell.content) cellEl.appendChild(renderSpan(documentRef, span))
      tr.appendChild(cellEl)
    })
    tbody.appendChild(tr)
  })
  tableEl.appendChild(tbody)
  return tableEl
}

export function renderBlock(documentRef: Document, block: BlockNode, path: BlockPath, ordinal?: number): HTMLElement {
  if (block.type === 'table') return renderTable(documentRef, block, path)
  const el = documentRef.createElement(blockTag(block))
  el.setAttribute('data-path', pathToAttr(path))
  if (block.type === 'listItem') {
    el.className = 'cwe-list-item'
    el.setAttribute('data-list', block.attrs.kind)
    if (block.attrs.kind === 'ordered') el.setAttribute('data-ordinal', String(ordinal ?? 1))
  }
  if (block.type === 'todo') {
    el.className = 'cwe-todo'
    el.setAttribute('data-checked', String(block.attrs.checked))
    // A checkbox element contributes no text nodes, so offset mapping is safe.
    const box = documentRef.createElement('input')
    box.type = 'checkbox'
    box.className = 'cwe-todo-box'
    box.checked = block.attrs.checked
    box.tabIndex = -1
    box.contentEditable = 'false'
    el.appendChild(box)
  }
  if (block.type === 'codeBlock') el.className = 'cwe-code'
  if (block.type === 'callout') {
    el.className = 'cwe-callout'
    el.setAttribute('data-emoji', block.attrs?.emoji ?? '💡')
  }
  if (block.type === 'divider') {
    el.contentEditable = 'false'
    return el
  }
  const align = block.attrs?.align
  if (align && align !== 'left' && block.type !== 'codeBlock') el.style.textAlign = align
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
  for (const child of renderBlocks(documentRef, block.children, path)) childrenEl.appendChild(child)
  group.appendChild(childrenEl)
  return group
}

/**
 * Renders a sibling run of blocks, numbering consecutive ordered list items
 * (a bullet item or any other block type resets the count).
 */
export function renderBlocks(documentRef: Document, blocks: BlockNode[], prefix: BlockPath): HTMLElement[] {
  let ordinal = 0
  return blocks.map((block, i) => {
    ordinal = block.type === 'listItem' && block.attrs.kind === 'ordered' ? ordinal + 1 : 0
    return renderBlock(documentRef, block, [...prefix, i], ordinal)
  })
}
