import type { Editor } from '@custom-wysiwyg/core'
import { cellContext, pathToAttr } from '@custom-wysiwyg/core'
import { clampToViewport } from './position'
import { injectStyles } from './styles'

interface TableAction {
  label: string
  title: string
  run: (editor: Editor) => void
}

const ACTIONS: TableAction[] = [
  { label: '+Row', title: 'Add a row below', run: (e) => void e.commands.addTableRow() },
  { label: '+Col', title: 'Add a column to the right', run: (e) => void e.commands.addTableColumn() },
  { label: '−Row', title: 'Delete this row', run: (e) => void e.commands.deleteTableRow() },
  { label: '−Col', title: 'Delete this column', run: (e) => void e.commands.deleteTableColumn() },
  { label: '✕', title: 'Delete table', run: (e) => void e.commands.deleteTable() },
]

/**
 * Table chrome: a small toolbar that appears above a table while the caret
 * is inside it, exposing the row/column/table commands. Framework-free.
 */
export class TableMenu {
  readonly dom: HTMLElement

  private editor: Editor
  private win: Window
  private unsubscribers: Array<() => void> = []

  constructor(editor: Editor) {
    this.editor = editor
    const documentRef = editor.dom.ownerDocument
    this.win = documentRef.defaultView as Window
    injectStyles(documentRef)

    this.dom = documentRef.createElement('div')
    this.dom.className = 'cwe-table-menu'
    this.dom.style.display = 'none'
    // Keep focus (and the caret's cell) in the editor while clicking.
    this.dom.addEventListener('mousedown', (e) => e.preventDefault())
    for (const action of ACTIONS) {
      const button = documentRef.createElement('button')
      button.type = 'button'
      button.textContent = action.label
      button.title = action.title
      button.addEventListener('click', () => {
        action.run(this.editor)
        this.editor.focus()
        this.update()
      })
      this.dom.appendChild(button)
    }
    documentRef.body.appendChild(this.dom)

    this.unsubscribers = [
      editor.on('update', () => this.update()),
      editor.on('blur', () => this.hide()),
    ]
    this.win.addEventListener('scroll', this.onWindowMove, true)
    this.win.addEventListener('resize', this.onWindowMove)
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.win.removeEventListener('scroll', this.onWindowMove, true)
    this.win.removeEventListener('resize', this.onWindowMove)
    this.dom.remove()
  }

  private onWindowMove = (): void => {
    if (this.dom.style.display !== 'none') this.update()
  }

  private hide(): void {
    this.dom.style.display = 'none'
  }

  private update(): void {
    const state = this.editor.getState()
    const ctx = cellContext(state.doc, state.selection.head.path)
    if (!ctx) {
      this.hide()
      return
    }
    const tableEl = this.editor.dom.querySelector(`[data-path="${pathToAttr(ctx.tablePath)}"]`)
    if (!tableEl) {
      this.hide()
      return
    }
    const rect = tableEl.getBoundingClientRect()
    this.dom.style.display = 'flex'
    const width = this.dom.offsetWidth
    const height = this.dom.offsetHeight
    const { left, top } = clampToViewport(this.win, rect.right - width, rect.top - height - 6, width)
    this.dom.style.left = `${left}px`
    this.dom.style.top = `${top}px`
  }
}
