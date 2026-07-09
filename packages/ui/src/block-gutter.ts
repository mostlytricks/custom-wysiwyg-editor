import type { Editor } from '@custom-wysiwyg/core'
import { attrToPath, blockAt, blockLength, lastPath, pathToAttr } from '@custom-wysiwyg/core'
import { injectStyles } from './styles'

/**
 * Notion-style block chrome: hovering a top-level block shows a gutter with
 * a `+` button (insert a block below, slash menu pre-opened) and a `⠿` drag
 * handle (drag to reorder; click to select the block). Framework-free.
 */
export class BlockGutter {
  readonly dom: HTMLElement

  private editor: Editor
  private win: Window
  private hoveredEl: HTMLElement | null = null
  private dragSourcePath: number[] | null = null
  private dropIndicator: HTMLElement
  private dropTarget: { path: number[]; side: 'before' | 'after' } | null = null
  private unsubscribers: Array<() => void> = []

  constructor(editor: Editor) {
    this.editor = editor
    const documentRef = editor.dom.ownerDocument
    this.win = documentRef.defaultView as Window
    injectStyles(documentRef)

    this.dom = documentRef.createElement('div')
    this.dom.className = 'cwe-gutter'
    this.dom.style.display = 'none'
    // Keep the editor's focus/selection when interacting with the gutter.
    this.dom.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.cwe-gutter-drag') === null) e.preventDefault()
    })

    const plus = documentRef.createElement('button')
    plus.type = 'button'
    plus.className = 'cwe-gutter-btn cwe-gutter-plus'
    plus.textContent = '+'
    plus.title = 'Add a block below'
    plus.addEventListener('click', () => this.insertBelow())

    const drag = documentRef.createElement('button')
    drag.type = 'button'
    drag.className = 'cwe-gutter-btn cwe-gutter-drag'
    drag.textContent = '⠿'
    drag.title = 'Drag to move · click to select'
    drag.draggable = true
    drag.addEventListener('click', () => this.selectBlock())
    drag.addEventListener('dragstart', (e) => this.onDragStart(e))
    drag.addEventListener('dragend', () => this.onDragEnd())

    this.dom.append(plus, drag)
    documentRef.body.appendChild(this.dom)

    this.dropIndicator = documentRef.createElement('div')
    this.dropIndicator.className = 'cwe-drop-indicator'
    this.dropIndicator.style.display = 'none'
    documentRef.body.appendChild(this.dropIndicator)

    editor.dom.addEventListener('mousemove', this.onMouseMove)
    editor.dom.addEventListener('dragover', this.onDragOver)
    editor.dom.addEventListener('drop', this.onDrop)
    documentRef.addEventListener('mousemove', this.onDocMouseMove)
    this.unsubscribers = [editor.on('change', () => this.hide())]
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    const documentRef = this.editor.dom.ownerDocument
    this.editor.dom.removeEventListener('mousemove', this.onMouseMove)
    this.editor.dom.removeEventListener('dragover', this.onDragOver)
    this.editor.dom.removeEventListener('drop', this.onDrop)
    documentRef.removeEventListener('mousemove', this.onDocMouseMove)
    this.dom.remove()
    this.dropIndicator.remove()
  }

  /** The top-level block element containing `node`. */
  private topBlockElOf(node: Node): HTMLElement | null {
    let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement
    let candidate: HTMLElement | null = null
    while (el && el !== this.editor.dom) {
      if (el.hasAttribute('data-path') || el.classList.contains('cwe-block-group')) candidate = el
      el = el.parentElement
    }
    return candidate
  }

  private pathOf(el: HTMLElement): number[] | null {
    const pathEl = el.hasAttribute('data-path') ? el : el.querySelector<HTMLElement>('[data-path]')
    const attr = pathEl?.getAttribute('data-path')
    return attr != null ? attrToPath(attr) : null
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (this.dragSourcePath) return
    const blockEl = this.topBlockElOf(event.target as Node)
    if (!blockEl) return
    if (blockEl === this.hoveredEl) return
    this.hoveredEl = blockEl
    const rect = blockEl.getBoundingClientRect()
    this.dom.style.display = 'flex'
    const height = this.dom.offsetHeight || 24
    this.dom.style.left = `${rect.left - this.dom.offsetWidth - 6}px`
    this.dom.style.top = `${rect.top + Math.min(4, Math.max(0, (rect.height - height) / 2))}px`
  }

  /** Hide when the pointer leaves both the editor and the gutter. */
  private onDocMouseMove = (event: MouseEvent): void => {
    if (this.dragSourcePath) return
    if (this.dom.style.display === 'none') return
    const target = event.target as Node
    if (this.editor.dom.contains(target) || this.dom.contains(target)) return
    this.hide()
  }

  private hide(): void {
    this.hoveredEl = null
    this.dom.style.display = 'none'
  }

  private insertBelow(): void {
    if (!this.hoveredEl) return
    const path = this.pathOf(this.hoveredEl)
    if (!path) return
    const block = blockAt(this.editor.getState().doc, path)
    if (!block) return
    const end = block.type === 'table' ? 0 : blockLength(block)
    this.editor.commands.setSelection({ anchor: { path, offset: end }, head: { path, offset: end } })
    this.editor.focus()
    // A fresh paragraph below, pre-armed with '/' so the slash menu opens.
    if (this.editor.commands.insertParagraphAfter()) this.editor.commands.insertText('/')
  }

  private selectBlock(): void {
    if (!this.hoveredEl) return
    const path = this.pathOf(this.hoveredEl)
    if (!path) return
    const state = this.editor.getState()
    const block = blockAt(state.doc, path)
    if (!block) return
    // Select the block's whole subtree: start of its text to the end of its
    // last descendant's text.
    const sub = { type: 'doc' as const, children: [block] }
    const tail = lastPath(sub)
    const endPath = [...path, ...tail.slice(1)]
    const endBlock = blockAt(state.doc, endPath)
    this.editor.focus()
    this.editor.commands.setSelection({
      anchor: { path, offset: 0 },
      head: { path: endPath, offset: endBlock ? blockLength(endBlock) : 0 },
    })
  }

  private onDragStart(event: DragEvent): void {
    if (!this.hoveredEl) return
    this.dragSourcePath = this.pathOf(this.hoveredEl)
    if (event.dataTransfer && this.dragSourcePath) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-cwe-block', pathToAttr(this.dragSourcePath))
      if (this.hoveredEl) event.dataTransfer.setDragImage(this.hoveredEl, 0, 0)
    }
  }

  private onDragOver = (event: DragEvent): void => {
    if (!this.dragSourcePath) return
    event.preventDefault()
    const blockEl = this.topBlockElOf(event.target as Node)
    if (!blockEl) return
    const path = this.pathOf(blockEl)
    if (!path) return
    const rect = blockEl.getBoundingClientRect()
    const side: 'before' | 'after' = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    this.dropTarget = { path, side }
    this.dropIndicator.style.display = 'block'
    this.dropIndicator.style.left = `${rect.left}px`
    this.dropIndicator.style.width = `${rect.width}px`
    this.dropIndicator.style.top = `${(side === 'before' ? rect.top : rect.bottom) - 1}px`
  }

  private onDrop = (event: DragEvent): void => {
    if (!this.dragSourcePath || !this.dropTarget) return
    event.preventDefault()
    this.editor.commands.moveBlock(this.dragSourcePath, this.dropTarget.path, this.dropTarget.side)
    this.editor.focus()
    this.onDragEnd()
  }

  private onDragEnd(): void {
    this.dragSourcePath = null
    this.dropTarget = null
    this.dropIndicator.style.display = 'none'
    this.hide()
  }
}
