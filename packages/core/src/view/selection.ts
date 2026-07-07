import type { Position, SelectionRange } from '../model/position'

/**
 * Maps between DOM selection endpoints and model positions. Blocks are
 * identified by their data-block attribute; offsets are character counts
 * across the block's text nodes, which mirrors how span offsets work in the
 * model.
 */

function collectTextNodes(el: Node): Text[] {
  const out: Text[] = []
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node as Text)
      return
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child)
  }
  visit(el)
  return out
}

function findBlockElement(root: HTMLElement, node: Node): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as HTMLElement).hasAttribute('data-block')) {
      return current as HTMLElement
    }
    current = current.parentNode
  }
  return null
}

export function domPointToPosition(root: HTMLElement, node: Node, offset: number): Position | null {
  if (node === root) {
    // Selection landed between blocks; snap to the nearest block start.
    const blockCount = root.children.length
    if (blockCount === 0) return null
    return { block: Math.max(0, Math.min(offset, blockCount - 1)), offset: 0 }
  }
  const blockEl = findBlockElement(root, node)
  if (!blockEl) return null
  const blockIndex = Number(blockEl.getAttribute('data-block'))
  if (Number.isNaN(blockIndex)) return null

  if (node.nodeType === Node.TEXT_NODE) {
    let acc = 0
    for (const textNode of collectTextNodes(blockEl)) {
      if (textNode === node) return { block: blockIndex, offset: acc + offset }
      acc += textNode.nodeValue?.length ?? 0
    }
    return { block: blockIndex, offset: acc }
  }

  // Element point: count the text contained in everything before childNodes[offset].
  const boundary = node.childNodes[offset] ?? null
  let acc = 0
  const walk = (current: Node): boolean => {
    if (current === boundary) return true
    if (current.nodeType === Node.TEXT_NODE) {
      acc += current.nodeValue?.length ?? 0
      return false
    }
    for (let child = current.firstChild; child; child = child.nextSibling) {
      if (walk(child)) return true
    }
    return false
  }
  walk(blockEl)
  return { block: blockIndex, offset: acc }
}

export function positionToDOMPoint(root: HTMLElement, pos: Position): { node: Node; offset: number } | null {
  const blockEl = root.querySelector(`[data-block="${pos.block}"]`)
  if (!blockEl) return null
  let acc = 0
  for (const textNode of collectTextNodes(blockEl)) {
    const len = textNode.nodeValue?.length ?? 0
    if (pos.offset <= acc + len) return { node: textNode, offset: pos.offset - acc }
    acc += len
  }
  return { node: blockEl, offset: 0 }
}

export function readDOMSelection(root: HTMLElement): SelectionRange | null {
  const documentRef = root.ownerDocument
  const sel = documentRef.getSelection ? documentRef.getSelection() : documentRef.defaultView?.getSelection()
  if (!sel || !sel.anchorNode || !sel.focusNode) return null
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null
  const anchor = domPointToPosition(root, sel.anchorNode, sel.anchorOffset)
  const head = domPointToPosition(root, sel.focusNode, sel.focusOffset)
  if (!anchor || !head) return null
  return { anchor, head }
}

export function applyDOMSelection(root: HTMLElement, selection: SelectionRange): void {
  const documentRef = root.ownerDocument
  const sel = documentRef.getSelection ? documentRef.getSelection() : documentRef.defaultView?.getSelection()
  if (!sel) return
  const anchor = positionToDOMPoint(root, selection.anchor)
  const head = positionToDOMPoint(root, selection.head)
  if (!anchor || !head) return
  try {
    sel.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset)
  } catch {
    // Selection APIs vary across environments (and test DOMs); a failed
    // restore is not fatal — the model selection stays authoritative.
  }
}
