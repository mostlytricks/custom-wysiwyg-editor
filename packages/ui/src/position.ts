import type { Editor } from '@custom-wysiwyg/core'

/**
 * Viewport rectangle of the current DOM selection inside the editor, or null
 * when the selection isn't available. For a collapsed selection this is the
 * caret rectangle.
 */
export function selectionRect(editor: Editor): DOMRect | null {
  const documentRef = editor.dom.ownerDocument
  const sel = documentRef.getSelection ? documentRef.getSelection() : documentRef.defaultView?.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return null
  if (!editor.dom.contains(sel.anchorNode)) return null
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    // Empty blocks report a zero rect; fall back to the block element.
    const node = sel.anchorNode
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
    return el ? el.getBoundingClientRect() : null
  }
  return rect
}

/** Clamps a fixed-position menu into the viewport. */
export function clampToViewport(win: Window, left: number, top: number, width: number): { left: number; top: number } {
  const maxLeft = win.innerWidth - width - 8
  return { left: Math.max(8, Math.min(left, maxLeft)), top: Math.max(8, top) }
}
