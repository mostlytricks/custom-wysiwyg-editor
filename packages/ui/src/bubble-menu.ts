import type { Editor, FontSizeToken, HeadingLevel } from '@custom-wysiwyg/core'
import { blockAt, getMark, marksAtOffset, selectionIsCollapsed } from '@custom-wysiwyg/core'
import { clampToViewport, selectionRect } from './position'
import { injectStyles } from './styles'

interface BubbleButton {
  label: string
  title: string
  isActive?: (editor: Editor) => boolean
  run: (editor: Editor) => void
  separatorBefore?: boolean
}

function currentBlock(editor: Editor) {
  const state = editor.getState()
  return blockAt(state.doc, state.selection.head.path)
}

const BUTTONS: BubbleButton[] = [
  {
    label: 'B',
    title: 'Bold (Ctrl+B)',
    isActive: (e) => e.isMarkActive('bold'),
    run: (e) => e.commands.toggleBold(),
  },
  {
    label: 'I',
    title: 'Italic (Ctrl+I)',
    isActive: (e) => e.isMarkActive('italic'),
    run: (e) => e.commands.toggleItalic(),
  },
  {
    label: '</>',
    title: 'Inline code',
    isActive: (e) => e.isMarkActive('code'),
    run: (e) => e.commands.toggleCode(),
  },
  {
    label: '🔗',
    title: 'Link',
    isActive: (e) => e.isMarkActive('link'),
    run: (e) => {
      if (e.isMarkActive('link')) {
        e.commands.setLink('')
        return
      }
      const href = e.dom.ownerDocument.defaultView?.prompt('Link URL')
      if (href) e.commands.setLink(href)
    },
  },
  {
    label: 'H1',
    title: 'Heading 1',
    separatorBefore: true,
    isActive: (e) => {
      const block = currentBlock(e)
      return block?.type === 'heading' && block.attrs.level === 1
    },
    run: (e) => toggleHeading(e, 1),
  },
  {
    label: 'H2',
    title: 'Heading 2',
    isActive: (e) => {
      const block = currentBlock(e)
      return block?.type === 'heading' && block.attrs.level === 2
    },
    run: (e) => toggleHeading(e, 2),
  },
  {
    label: '≡',
    title: 'Center',
    separatorBefore: true,
    isActive: (e) => currentBlock(e)?.attrs?.align === 'center',
    run: (e) => {
      const active = currentBlock(e)?.attrs?.align === 'center'
      e.commands.setAlign(active ? 'left' : 'center')
    },
  },
]

function toggleHeading(editor: Editor, level: HeadingLevel): void {
  const block = currentBlock(editor)
  if (block?.type === 'heading' && block.attrs.level === level) editor.commands.setParagraph()
  else editor.commands.setHeading(level)
}

export interface BubbleMenuOptions {
  buttons?: BubbleButton[]
}

/** Notion-ish preset palette. null = reset to default. */
const TEXT_COLORS: Array<string | null> = [
  null,
  '#9b9a97',
  '#64473a',
  '#d9730d',
  '#dfab01',
  '#0f7b6c',
  '#0b6e99',
  '#6940a5',
  '#ad1a72',
  '#e03e3e',
]
const HIGHLIGHT_COLORS: Array<string | null> = [null, '#fbf3db', '#ddedea', '#ddebf1', '#f4dfeb', '#fbe4e4']
const FONT_SIZE_OPTIONS: Array<{ label: string; value: FontSizeToken | null }> = [
  { label: 'S', value: 'small' },
  { label: 'M', value: null },
  { label: 'L', value: 'large' },
  { label: 'XL', value: 'huge' },
]

/**
 * Floating toolbar that appears above a non-collapsed selection, Notion
 * style. Framework-free: pass any core Editor.
 */
export class BubbleMenu {
  readonly dom: HTMLElement

  private editor: Editor
  private buttons: BubbleButton[]
  private buttonEls: HTMLButtonElement[] = []
  private unsubscribers: Array<() => void> = []
  private win: Window
  private palette: HTMLElement
  private paletteToggle: HTMLButtonElement
  private paletteOpen = false

  constructor(editor: Editor, options: BubbleMenuOptions = {}) {
    this.editor = editor
    this.buttons = options.buttons ?? BUTTONS
    const documentRef = editor.dom.ownerDocument
    this.win = documentRef.defaultView as Window
    injectStyles(documentRef)

    this.dom = documentRef.createElement('div')
    this.dom.className = 'cwe-bubble'
    this.dom.style.display = 'none'
    // Keep focus (and the selection) in the editor while clicking buttons.
    this.dom.addEventListener('mousedown', (e) => e.preventDefault())

    const row = documentRef.createElement('div')
    row.className = 'cwe-bubble-row'
    for (const button of this.buttons) {
      if (button.separatorBefore) {
        const sep = documentRef.createElement('div')
        sep.className = 'cwe-sep'
        row.appendChild(sep)
      }
      const el = documentRef.createElement('button')
      el.type = 'button'
      el.textContent = button.label
      el.title = button.title
      el.addEventListener('click', () => {
        button.run(this.editor)
        this.update()
      })
      this.buttonEls.push(el)
      row.appendChild(el)
    }

    const sep = documentRef.createElement('div')
    sep.className = 'cwe-sep'
    row.appendChild(sep)
    this.paletteToggle = documentRef.createElement('button')
    this.paletteToggle.type = 'button'
    this.paletteToggle.textContent = 'A'
    this.paletteToggle.title = 'Color & size'
    this.paletteToggle.addEventListener('click', () => {
      this.paletteOpen = !this.paletteOpen
      this.syncPalette()
    })
    row.appendChild(this.paletteToggle)

    this.palette = this.buildPalette(documentRef)
    this.dom.append(row, this.palette)
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
    this.paletteOpen = false
    this.syncPalette()
  }

  private buildPalette(documentRef: Document): HTMLElement {
    const palette = documentRef.createElement('div')
    palette.className = 'cwe-palette'
    palette.style.display = 'none'

    const addRow = (label: string): HTMLElement => {
      const rowEl = documentRef.createElement('div')
      rowEl.className = 'cwe-palette-row'
      const labelEl = documentRef.createElement('span')
      labelEl.className = 'cwe-palette-label'
      labelEl.textContent = label
      rowEl.appendChild(labelEl)
      palette.appendChild(rowEl)
      return rowEl
    }

    const colorRow = addRow('Text')
    for (const value of TEXT_COLORS) {
      const swatch = documentRef.createElement('button')
      swatch.type = 'button'
      swatch.className = 'cwe-swatch'
      swatch.title = value ?? 'Default color'
      if (value) swatch.style.backgroundColor = value
      else swatch.textContent = '–'
      swatch.addEventListener('click', () => {
        this.editor.commands.setColor(value)
        this.update()
      })
      colorRow.appendChild(swatch)
    }

    const highlightRow = addRow('Mark')
    for (const value of HIGHLIGHT_COLORS) {
      const swatch = documentRef.createElement('button')
      swatch.type = 'button'
      swatch.className = 'cwe-swatch'
      swatch.title = value ? `Highlight ${value}` : 'No highlight'
      if (value) swatch.style.backgroundColor = value
      else swatch.textContent = '–'
      swatch.addEventListener('click', () => {
        this.editor.commands.setHighlight(value)
        this.update()
      })
      highlightRow.appendChild(swatch)
    }

    const sizeRow = addRow('Size')
    for (const option of FONT_SIZE_OPTIONS) {
      const btn = documentRef.createElement('button')
      btn.type = 'button'
      btn.className = 'cwe-size'
      btn.textContent = option.label
      btn.title = option.value ? `Font size: ${option.value}` : 'Default size'
      btn.dataset.size = option.value ?? 'default'
      btn.addEventListener('click', () => {
        this.editor.commands.setFontSize(option.value)
        this.update()
      })
      sizeRow.appendChild(btn)
    }

    return palette
  }

  private syncPalette(): void {
    this.palette.style.display = this.paletteOpen ? 'grid' : 'none'
    this.paletteToggle.classList.toggle('cwe-active', this.paletteOpen)
    if (!this.paletteOpen) return
    // Reflect the active font size on the size buttons.
    const state = this.editor.getState()
    const block = blockAt(state.doc, state.selection.head.path)
    const spanMarks = state.storedMarks ?? (block ? marksAtOffset(block, state.selection.head.offset) : [])
    const active = getMark(spanMarks, 'fontSize')?.attrs.value ?? 'default'
    for (const btn of this.palette.querySelectorAll<HTMLButtonElement>('.cwe-size')) {
      btn.classList.toggle('cwe-active', btn.dataset.size === active)
    }
  }

  private update(): void {
    const state = this.editor.getState()
    if (selectionIsCollapsed(state.selection)) {
      this.hide()
      return
    }
    const rect = selectionRect(this.editor)
    if (!rect) {
      this.hide()
      return
    }
    this.dom.style.display = 'flex'
    this.buttons.forEach((button, i) => {
      this.buttonEls[i]?.classList.toggle('cwe-active', button.isActive?.(this.editor) ?? false)
    })
    this.syncPalette()
    const width = this.dom.offsetWidth
    const height = this.dom.offsetHeight
    const { left, top } = clampToViewport(this.win, rect.left + rect.width / 2 - width / 2, rect.top - height - 8, width)
    this.dom.style.left = `${left}px`
    this.dom.style.top = `${top}px`
  }
}
