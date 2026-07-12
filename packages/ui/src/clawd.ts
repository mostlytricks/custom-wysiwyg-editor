import type { Editor } from '@custom-wysiwyg/core'
import { injectStyles } from './styles'

export interface ClawdOptions {
  /** The performer. Default 🐉 (try '🦀' for the classic). */
  emoji?: string
  /** Quiet time (ms) before the jazz winds down. Default 1200. */
  cooldown?: number
}

const NOTES = ['♪', '♫', '♬', '🎷', '🎶']

/**
 * Clawd, the corner dragon: hangs out at the editor's top-right corner and
 * jazzes while you type. Purely cosmetic — listens to editor events only,
 * never reads or touches the document. `aria-hidden` and pointer-transparent,
 * so it's invisible to assistive tech and can't steal a click; all motion is
 * disabled under `prefers-reduced-motion`.
 */
export class Clawd {
  readonly dom: HTMLElement

  private editor: Editor
  private win: Window
  private buddy: HTMLElement
  private cooldown: number
  private jazzTimer: ReturnType<typeof setTimeout> | null = null
  private lastNoteAt = 0
  private unsubscribers: Array<() => void> = []

  constructor(editor: Editor, options: ClawdOptions = {}) {
    this.editor = editor
    this.cooldown = options.cooldown ?? 1200
    const documentRef = editor.dom.ownerDocument
    this.win = documentRef.defaultView as Window
    injectStyles(documentRef)

    this.dom = documentRef.createElement('div')
    this.dom.className = 'cwe-clawd'
    this.dom.setAttribute('aria-hidden', 'true')

    this.buddy = documentRef.createElement('span')
    this.buddy.className = 'cwe-clawd-buddy'
    this.buddy.textContent = options.emoji ?? '🐉'
    this.dom.appendChild(this.buddy)
    documentRef.body.appendChild(this.dom)

    this.unsubscribers = [editor.on('change', () => this.jazz())]
    this.win.addEventListener('scroll', this.position, true)
    this.win.addEventListener('resize', this.position)
    this.position()
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.win.removeEventListener('scroll', this.position, true)
    this.win.removeEventListener('resize', this.position)
    if (this.jazzTimer !== null) clearTimeout(this.jazzTimer)
    this.dom.remove()
  }

  /** True while the band is playing (exposed for tests). */
  get jazzing(): boolean {
    return this.dom.classList.contains('cwe-jazzing')
  }

  private jazz(): void {
    this.dom.classList.add('cwe-jazzing')
    this.spawnNote()
    if (this.jazzTimer !== null) clearTimeout(this.jazzTimer)
    this.jazzTimer = setTimeout(() => {
      this.dom.classList.remove('cwe-jazzing')
      this.jazzTimer = null
    }, this.cooldown)
  }

  /** One floating note per beat, not per keystroke — throttled to ~4/s. */
  private spawnNote(): void {
    const now = Date.now()
    if (now - this.lastNoteAt < 250) return
    this.lastNoteAt = now
    const note = this.dom.ownerDocument.createElement('span')
    note.className = 'cwe-clawd-note'
    note.textContent = NOTES[now % NOTES.length]!
    note.style.left = `${-6 + (now % 21)}px`
    this.dom.appendChild(note)
    // animationend never fires under reduced motion (the note is hidden), so
    // a timeout does the cleanup either way.
    setTimeout(() => note.remove(), 1000)
  }

  private position = (): void => {
    const rect = this.editor.dom.getBoundingClientRect()
    this.dom.style.top = `${rect.top + 6}px`
    this.dom.style.left = `${rect.right - 30}px`
  }
}
