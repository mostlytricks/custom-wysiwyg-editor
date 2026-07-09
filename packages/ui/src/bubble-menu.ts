import type { Editor, FontSizeToken, HeadingLevel, SelectionRange } from '@custom-wysiwyg/core'
import { blockAt, getMark, marksAtOffset, selectionIsCollapsed } from '@custom-wysiwyg/core'
import { clampToViewport, selectionRect } from './position'
import { injectStyles } from './styles'

interface BubbleButton {
  /** Stable id for buttons the bubble menu handles specially (e.g. 'link'). */
  id?: string
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
    id: 'link',
    label: '🔗',
    title: 'Link',
    isActive: (e) => e.isMarkActive('link'),
    // Click is intercepted by the bubble menu to open the inline link editor.
    run: () => {},
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
  private linkEditor!: HTMLElement
  private linkInput!: HTMLInputElement
  private linkRemove!: HTMLButtonElement
  private linkOpen = false
  /** Selection captured when the link editor opened; focusing the input clears the live one. */
  private linkSelection: SelectionRange | null = null

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
        if (button.id === 'link') {
          this.toggleLinkEditor()
          return
        }
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
      if (this.paletteOpen) this.closeLinkEditor(false)
      this.syncPalette()
    })
    row.appendChild(this.paletteToggle)

    this.linkEditor = this.buildLinkEditor(documentRef)
    this.palette = this.buildPalette(documentRef)
    this.dom.append(row, this.linkEditor, this.palette)
    documentRef.body.appendChild(this.dom)

    this.unsubscribers = [
      editor.on('update', () => this.update()),
      // Focusing the link input blurs the editor; keep the bubble alive then.
      editor.on('blur', () => {
        if (!this.linkOpen) this.hide()
      }),
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
    this.closeLinkEditor(false)
  }

  private buildLinkEditor(documentRef: Document): HTMLElement {
    const editor = documentRef.createElement('div')
    editor.className = 'cwe-link-editor'
    editor.style.display = 'none'

    const input = documentRef.createElement('input')
    input.type = 'url'
    input.className = 'cwe-link-input'
    input.placeholder = 'Paste or type a link…'
    // The input must take focus on click, so opt out of the bubble's
    // focus-guard (the dom-level mousedown preventDefault) for it alone.
    input.addEventListener('mousedown', (e) => e.stopPropagation())
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.applyLink()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.closeLinkEditor(true)
      }
    })
    this.linkInput = input

    const apply = documentRef.createElement('button')
    apply.type = 'button'
    apply.className = 'cwe-link-apply'
    apply.textContent = 'Apply'
    apply.title = 'Apply link'
    apply.addEventListener('click', () => this.applyLink())

    const remove = documentRef.createElement('button')
    remove.type = 'button'
    remove.className = 'cwe-link-remove'
    remove.textContent = 'Remove'
    remove.title = 'Remove link'
    remove.addEventListener('click', () => this.commitLink(null))
    this.linkRemove = remove

    editor.append(input, apply, remove)
    return editor
  }

  private toggleLinkEditor(): void {
    if (this.linkOpen) this.closeLinkEditor(true)
    else this.openLinkEditor()
  }

  private openLinkEditor(): void {
    // Capture the selection rectangle while the editor still owns the DOM
    // selection — focusing the input moves it out.
    const rect = selectionRect(this.editor)
    const state = this.editor.getState()
    const block = blockAt(state.doc, state.selection.head.path)
    const marks = block ? marksAtOffset(block, state.selection.head.offset) : []
    const href = getMark(marks, 'link')?.attrs.href ?? ''
    this.linkSelection = state.selection

    this.paletteOpen = false
    this.syncPalette()
    this.linkInput.value = href
    this.linkRemove.style.display = href ? '' : 'none'
    this.linkOpen = true
    this.linkEditor.style.display = 'flex'
    if (rect) this.position(rect)
    this.linkInput.focus()
    this.linkInput.select()
  }

  private closeLinkEditor(refocus: boolean): void {
    if (!this.linkOpen) return
    this.linkOpen = false
    this.linkEditor.style.display = 'none'
    // Return focus (and the selection) to the editor so the caret is restored.
    if (refocus) this.editor.focus()
  }

  private applyLink(): void {
    this.commitLink(this.linkInput.value.trim() || null)
  }

  private commitLink(href: string | null): void {
    // Restore the selection captured on open — focusing the input moved the
    // live selection into it. applyMark replaces an existing link (so editing
    // a URL just works); a null href removes the link entirely.
    if (this.linkSelection) this.editor.commands.setSelection(this.linkSelection)
    if (href) this.editor.commands.applyMark({ type: 'link', attrs: { href } })
    else this.editor.commands.removeMark('link')
    this.closeLinkEditor(true)
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
    // While the link editor is open the selection is parked in the input, so
    // freeze the bubble where it is rather than re-reading a stale rect.
    if (this.linkOpen) return
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
    this.position(rect)
  }

  private position(rect: DOMRect): void {
    const width = this.dom.offsetWidth
    const height = this.dom.offsetHeight
    const { left, top } = clampToViewport(this.win, rect.left + rect.width / 2 - width / 2, rect.top - height - 8, width)
    this.dom.style.left = `${left}px`
    this.dom.style.top = `${top}px`
  }
}
