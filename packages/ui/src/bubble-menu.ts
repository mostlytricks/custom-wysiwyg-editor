import type { Editor, HeadingLevel } from '@custom-wysiwyg/core'
import { blockAt, selectionIsCollapsed } from '@custom-wysiwyg/core'
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

    for (const button of this.buttons) {
      if (button.separatorBefore) {
        const sep = documentRef.createElement('div')
        sep.className = 'cwe-sep'
        this.dom.appendChild(sep)
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
      this.dom.appendChild(el)
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
    const width = this.dom.offsetWidth
    const height = this.dom.offsetHeight
    const { left, top } = clampToViewport(this.win, rect.left + rect.width / 2 - width / 2, rect.top - height - 8, width)
    this.dom.style.left = `${left}px`
    this.dom.style.top = `${top}px`
  }
}
