import type { Position, SelectionRange } from '../model/position'
import { attrToPath, pathToAttr } from './render'

/**
 * Maps between DOM selection endpoints and model positions. Blocks are
 * identified by their data-path attribute ("0", "0.1", …); offsets are
 * character counts across the block element's text nodes, which mirrors how
 * span offsets work in the model. A block's nested children render outside
 * its data-path element, so its text nodes are always its own.
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
    if (current.nodeType === Node.ELEMENT_NODE && (current as HTMLElement).hasAttribute('data-path')) {
      return current as HTMLElement
    }
    current = current.parentNode
  }
  return null
}

/** The first block element inside `el` (or `el` itself when it is one). */
function firstBlockWithin(el: Element): HTMLElement | null {
  if (el.hasAttribute('data-path')) return el as HTMLElement
  return el.querySelector<HTMLElement>('[data-path]')
}

export function domPointToPosition(root: HTMLElement, node: Node, offset: number): Position | null {
  const blockEl = findBlockElement(root, node)
  if (!blockEl) {
    // Selection landed between blocks (on the root or a wrapper); snap to the
    // start of the nearest block inside the child at that boundary.
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const el = node as Element
    const childCount = el.children.length
    if (childCount === 0) return null
    const child = el.children[Math.max(0, Math.min(offset, childCount - 1))]!
    const target = firstBlockWithin(child)
    const path = target && attrToPath(target.getAttribute('data-path') ?? '')
    return path ? { path, offset: 0 } : null
  }
  const path = attrToPath(blockEl.getAttribute('data-path') ?? '')
  if (!path) return null

  if (node.nodeType === Node.TEXT_NODE) {
    let acc = 0
    for (const textNode of collectTextNodes(blockEl)) {
      if (textNode === node) return { path, offset: acc + offset }
      acc += textNode.nodeValue?.length ?? 0
    }
    return { path, offset: acc }
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
  return { path, offset: acc }
}

export function positionToDOMPoint(root: HTMLElement, pos: Position): { node: Node; offset: number } | null {
  const blockEl = root.querySelector(`[data-path="${pathToAttr(pos.path)}"]`)
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
