import type { Editor, Position } from '@custom-wysiwyg/core'
import { blockText, selectionIsCollapsed } from '@custom-wysiwyg/core'
import { clampToViewport, selectionRect } from './position'
import { injectStyles } from './styles'

export interface SlashMenuItem {
  id: string
  label: string
  /** Short text rendered in the icon box (e.g. 'H1', 'T'). */
  icon: string
  /** Extra search terms beyond the label. */
  keywords?: string
  run: (editor: Editor) => void
}

export const DEFAULT_SLASH_ITEMS: SlashMenuItem[] = [
  { id: 'text', label: 'Text', icon: 'T', keywords: 'paragraph plain body', run: (e) => e.commands.setParagraph() },
  { id: 'h1', label: 'Heading 1', icon: 'H1', keywords: 'title big', run: (e) => e.commands.setHeading(1) },
  { id: 'h2', label: 'Heading 2', icon: 'H2', keywords: 'subtitle', run: (e) => e.commands.setHeading(2) },
  { id: 'h3', label: 'Heading 3', icon: 'H3', keywords: 'subheading', run: (e) => e.commands.setHeading(3) },
  { id: 'align-left', label: 'Align left', icon: '⇤', keywords: 'alignment', run: (e) => e.commands.setAlign('left') },
  { id: 'align-center', label: 'Align center', icon: '↔', keywords: 'alignment middle', run: (e) => e.commands.setAlign('center') },
  { id: 'align-right', label: 'Align right', icon: '⇥', keywords: 'alignment', run: (e) => e.commands.setAlign('right') },
]

export function filterSlashItems(items: SlashMenuItem[], query: string): SlashMenuItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => `${item.label} ${item.keywords ?? ''}`.toLowerCase().includes(q))
}

/** '/' at the start of a block or after whitespace, plus the query typed after it. */
const SLASH_PATTERN = /(?:^|\s)\/([a-zA-Z0-9-]*)$/

export interface SlashMenuOptions {
  items?: SlashMenuItem[]
}

/**
 * Notion-style command palette: type '/' to open, keep typing to filter,
 * navigate with arrows, Enter to apply. Applying deletes the '/query' text
 * and runs the item's command. Framework-free: pass any core Editor.
 */
export class SlashMenu {
  readonly dom: HTMLElement

  private editor: Editor
  private items: SlashMenuItem[]
  private filtered: SlashMenuItem[] = []
  private activeIndex = 0
  private open = false
  private dismissed = false
  private slashFrom: Position | null = null
  private unsubscribers: Array<() => void> = []
  private win: Window

  constructor(editor: Editor, options: SlashMenuOptions = {}) {
    this.editor = editor
    this.items = options.items ?? DEFAULT_SLASH_ITEMS
    const documentRef = editor.dom.ownerDocument
    this.win = documentRef.defaultView as Window
    injectStyles(documentRef)

    this.dom = documentRef.createElement('div')
    this.dom.className = 'cwe-slash'
    this.dom.style.display = 'none'
    this.dom.addEventListener('mousedown', (e) => e.preventDefault())
    documentRef.body.appendChild(this.dom)

    // Capture phase so navigation keys are handled before the editor sees them.
    editor.dom.addEventListener('keydown', this.onKeyDown, true)
    this.unsubscribers = [
      editor.on('update', () => this.update()),
      editor.on('blur', () => this.close()),
    ]
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.editor.dom.removeEventListener('keydown', this.onKeyDown, true)
    this.dom.remove()
  }

  isOpen(): boolean {
    return this.open
  }

  private close(): void {
    this.open = false
    this.slashFrom = null
    this.dom.style.display = 'none'
  }

  /** Reads the text before the caret and opens/filters/closes accordingly. */
  private update(): void {
    const state = this.editor.getState()
    if (!selectionIsCollapsed(state.selection)) {
      this.close()
      return
    }
    const head = state.selection.head
    const block = state.doc.children[head.block]
    if (!block) {
      this.close()
      return
    }
    const textBefore = blockText(block).slice(0, head.offset)
    const match = SLASH_PATTERN.exec(textBefore)
    if (!match) {
      this.close()
      this.dismissed = false
      return
    }
    if (this.dismissed) return
    const query = match[1] ?? ''
    this.slashFrom = { block: head.block, offset: head.offset - query.length - 1 }
    this.filtered = filterSlashItems(this.items, query)
    this.activeIndex = Math.min(this.activeIndex, Math.max(0, this.filtered.length - 1))
    if (!this.open) this.activeIndex = 0
    this.open = true
    this.render()
  }

  private render(): void {
    const documentRef = this.dom.ownerDocument
    this.dom.replaceChildren()
    if (this.filtered.length === 0) {
      const empty = documentRef.createElement('div')
      empty.className = 'cwe-slash-empty'
      empty.textContent = 'No results'
      this.dom.appendChild(empty)
    }
    this.filtered.forEach((item, index) => {
      const el = documentRef.createElement('div')
      el.className = 'cwe-slash-item' + (index === this.activeIndex ? ' cwe-active' : '')
      const icon = documentRef.createElement('div')
      icon.className = 'cwe-slash-icon'
      icon.textContent = item.icon
      const label = documentRef.createElement('div')
      label.className = 'cwe-slash-label'
      label.textContent = item.label
      el.append(icon, label)
      el.addEventListener('mouseenter', () => {
        this.activeIndex = index
        this.render()
      })
      el.addEventListener('click', () => this.select(item))
      this.dom.appendChild(el)
    })
    this.dom.style.display = 'block'
    const rect = selectionRect(this.editor)
    if (!rect) return
    const { left, top } = clampToViewport(this.win, rect.left, rect.bottom + 6, this.dom.offsetWidth)
    this.dom.style.left = `${left}px`
    this.dom.style.top = `${top}px`
  }

  private select(item: SlashMenuItem): void {
    const from = this.slashFrom
    this.close()
    if (from) {
      const head = this.editor.getState().selection.head
      this.editor.commands.deleteRange(from, head)
    }
    item.run(this.editor)
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.open) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        if (this.filtered.length > 0) {
          this.activeIndex = (this.activeIndex + 1) % this.filtered.length
          this.render()
        }
        break
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        if (this.filtered.length > 0) {
          this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length
          this.render()
        }
        break
      case 'Enter': {
        event.preventDefault()
        event.stopPropagation()
        const item = this.filtered[this.activeIndex]
        if (item) this.select(item)
        else this.close()
        break
      }
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        this.dismissed = true
        this.close()
        break
    }
  }
}
