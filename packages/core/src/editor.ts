import type {
  Alignment,
  DocNode,
  FontFamilyToken,
  FontSizeToken,
  HeadingLevel,
  ListKind,
  Mark,
  MarkType,
} from './model/types'
import type { Position, SelectionRange } from './model/position'
import { collapsedSelection, selectionsEqual } from './model/position'
import * as commands from './commands'
import { runInputRules } from './inputrules'
import { blockAt, type BlockPath } from './model/path'
import { blockLength, blockText } from './model/spans'
import { parseHTML } from './parse/html'
import type { BlockNode } from './model/types'
import type { EditorState } from './state'
import { createEditorState } from './state'
import { renderBlocks } from './view/render'
import { applyDOMSelection, readDOMSelection } from './view/selection'

export interface EditorOptions {
  /** Initial document. Defaults to a single empty paragraph. */
  doc?: DocNode
  /** Called after every change to the document (not on selection-only changes). */
  onChange?: (editor: Editor) => void
  autofocus?: boolean
  /** Markdown-style autoformatting while typing (`# `, `**bold**`, …). Default true. */
  inputRules?: boolean
  /** Hint shown (via CSS) while the document is empty. */
  placeholder?: string
}

/**
 * - 'change': the document changed
 * - 'update': any state change (document, selection, or stored marks)
 * - 'focus' / 'blur': the contenteditable gained or lost focus
 */
export type EditorEventType = 'change' | 'update' | 'focus' | 'blur'

interface HistoryEntry {
  doc: DocNode
  selection: SelectionRange
}

const HISTORY_LIMIT = 100
/** Consecutive keystrokes within this window collapse into one undo step. */
const TYPING_COALESCE_MS = 750

/**
 * Binds the model to a contenteditable element. Input events are intercepted
 * (`beforeinput` + preventDefault), translated into commands against the
 * model, and the DOM is re-rendered from the result — the browser never
 * edits the document itself.
 */
export class Editor {
  readonly dom: HTMLElement

  private state: EditorState
  private options: EditorOptions
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private lastOrigin: string | null = null
  private lastPushTime = 0
  private composing = false
  private compositionSelection: SelectionRange | null = null
  private destroyed = false
  private listeners = new Map<EditorEventType, Set<(editor: Editor) => void>>()

  constructor(place: HTMLElement, options: EditorOptions = {}) {
    this.options = options
    this.state = createEditorState(options.doc)

    const documentRef = place.ownerDocument
    this.dom = documentRef.createElement('div')
    this.dom.className = 'cwe-content'
    this.dom.contentEditable = 'true'
    this.dom.style.whiteSpace = 'pre-wrap'
    this.dom.style.overflowWrap = 'break-word'
    this.dom.setAttribute('role', 'textbox')
    this.dom.setAttribute('aria-multiline', 'true')
    if (options.placeholder) {
      this.dom.setAttribute('data-placeholder', options.placeholder)
      this.dom.style.position = 'relative'
    }
    place.appendChild(this.dom)

    this.dom.addEventListener('beforeinput', this.onBeforeInput as EventListener)
    this.dom.addEventListener('keydown', this.onKeyDown)
    this.dom.addEventListener('compositionstart', this.onCompositionStart)
    this.dom.addEventListener('compositionend', this.onCompositionEnd as EventListener)
    this.dom.addEventListener('focus', this.onFocus)
    this.dom.addEventListener('blur', this.onBlur)
    this.dom.addEventListener('click', this.onClick)
    documentRef.addEventListener('selectionchange', this.onSelectionChange)

    this.renderView()
    if (options.autofocus) this.focus()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  getState(): EditorState {
    return this.state
  }

  /** Subscribe to editor events. Returns an unsubscribe function. */
  on(type: EditorEventType, handler: (editor: Editor) => void): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(handler)
    return () => set.delete(handler)
  }

  private emit(type: EditorEventType): void {
    const set = this.listeners.get(type)
    if (set) for (const handler of [...set]) handler(this)
  }

  getDoc(): DocNode {
    return this.state.doc
  }

  /** Replaces the document and clears history. Does not fire onChange. */
  setDoc(docNode: DocNode): void {
    this.state = createEditorState(docNode)
    this.undoStack = []
    this.redoStack = []
    this.lastOrigin = null
    this.renderView()
    this.emit('update')
  }

  focus(): void {
    this.dom.focus()
    applyDOMSelection(this.dom, this.state.selection)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    const documentRef = this.dom.ownerDocument
    documentRef.removeEventListener('selectionchange', this.onSelectionChange)
    this.listeners.clear()
    this.dom.remove()
  }

  undo(): boolean {
    const entry = this.undoStack.pop()
    if (!entry) return false
    this.redoStack.push({ doc: this.state.doc, selection: this.state.selection })
    this.state = { doc: entry.doc, selection: entry.selection, storedMarks: null }
    this.lastOrigin = null
    this.renderView()
    this.options.onChange?.(this)
    this.emit('change')
    this.emit('update')
    return true
  }

  redo(): boolean {
    const entry = this.redoStack.pop()
    if (!entry) return false
    this.undoStack.push({ doc: this.state.doc, selection: this.state.selection })
    this.state = { doc: entry.doc, selection: entry.selection, storedMarks: null }
    this.lastOrigin = null
    this.renderView()
    this.options.onChange?.(this)
    this.emit('change')
    this.emit('update')
    return true
  }

  /** High-level commands, ready to wire to a toolbar. */
  readonly commands = {
    insertText: (content: string): boolean => this.apply(commands.insertText(this.state, content), 'insertText'),
    insertLines: (content: string): boolean => this.apply(commands.insertLines(this.state, content)),
    insertBlocks: (blocks: BlockNode[]): boolean => this.apply(commands.insertBlocks(this.state, blocks)),
    deleteBackward: (): boolean => this.apply(commands.deleteBackward(this.state)),
    deleteForward: (): boolean => this.apply(commands.deleteForward(this.state)),
    splitBlock: (): boolean => this.apply(commands.splitBlock(this.state)),
    toggleMark: (mark: Mark): boolean => this.apply(commands.toggleMark(this.state, mark)),
    toggleBold: (): boolean => this.apply(commands.toggleMark(this.state, { type: 'bold' })),
    toggleItalic: (): boolean => this.apply(commands.toggleMark(this.state, { type: 'italic' })),
    toggleCode: (): boolean => this.apply(commands.toggleMark(this.state, { type: 'code' })),
    setLink: (href: string): boolean => this.apply(commands.toggleMark(this.state, { type: 'link', attrs: { href } })),
    applyMark: (mark: Mark): boolean => this.apply(commands.applyMark(this.state, mark)),
    removeMark: (type: MarkType): boolean => this.apply(commands.removeMark(this.state, type)),
    setColor: (value: string | null): boolean =>
      this.apply(
        value === null
          ? commands.removeMark(this.state, 'color')
          : commands.applyMark(this.state, { type: 'color', attrs: { value } }),
      ),
    setHighlight: (value: string | null): boolean =>
      this.apply(
        value === null
          ? commands.removeMark(this.state, 'highlight')
          : commands.applyMark(this.state, { type: 'highlight', attrs: { value } }),
      ),
    setFontSize: (value: FontSizeToken | null): boolean =>
      this.apply(
        value === null
          ? commands.removeMark(this.state, 'fontSize')
          : commands.applyMark(this.state, { type: 'fontSize', attrs: { value } }),
      ),
    setFontFamily: (value: FontFamilyToken | null): boolean =>
      this.apply(
        value === null
          ? commands.removeMark(this.state, 'fontFamily')
          : commands.applyMark(this.state, { type: 'fontFamily', attrs: { value } }),
      ),
    setHeading: (level: HeadingLevel): boolean => this.apply(commands.setHeading(this.state, level)),
    setParagraph: (): boolean => this.apply(commands.setParagraph(this.state)),
    setList: (kind: ListKind): boolean => this.apply(commands.setList(this.state, kind)),
    toggleList: (kind: ListKind): boolean => this.apply(commands.toggleList(this.state, kind)),
    indentListItem: (): boolean => this.apply(commands.indentListItem(this.state)),
    outdentListItem: (): boolean => this.apply(commands.outdentListItem(this.state)),
    setTodo: (): boolean => this.apply(commands.setTodo(this.state)),
    toggleTodo: (path?: BlockPath): boolean => this.apply(commands.toggleTodo(this.state, path)),
    setQuote: (): boolean => this.apply(commands.setQuote(this.state)),
    setCallout: (emoji?: string): boolean => this.apply(commands.setCallout(this.state, emoji)),
    setCodeBlock: (language?: string): boolean => this.apply(commands.setCodeBlock(this.state, language)),
    insertDivider: (): boolean => this.apply(commands.insertDivider(this.state)),
    insertTable: (rows?: number, cols?: number): boolean => this.apply(commands.insertTable(this.state, rows, cols)),
    moveBlock: (from: BlockPath, to: BlockPath, side: 'before' | 'after'): boolean =>
      this.apply(commands.moveBlock(this.state, from, to, side)),
    insertParagraphAfter: (): boolean => this.apply(commands.insertParagraphAfter(this.state)),
    addTableRow: (): boolean => this.apply(commands.addTableRow(this.state)),
    addTableColumn: (): boolean => this.apply(commands.addTableColumn(this.state)),
    deleteTableRow: (): boolean => this.apply(commands.deleteTableRow(this.state)),
    deleteTableColumn: (): boolean => this.apply(commands.deleteTableColumn(this.state)),
    deleteTable: (): boolean => this.apply(commands.deleteTable(this.state)),
    setAlign: (align: Alignment): boolean => this.apply(commands.setAlign(this.state, align)),
    selectAll: (): boolean => this.apply(commands.selectAll(this.state)),
    setSelection: (selection: SelectionRange): boolean => this.apply(commands.setSelection(this.state, selection)),
    selectBlock: (path?: BlockPath): boolean => this.apply(commands.selectBlock(this.state, path)),
    deleteRange: (from: Position, to: Position): boolean => this.apply(commands.deleteRange(this.state, from, to)),
  }

  /** Whether a mark is active at the current selection (for toolbar states). */
  isMarkActive(type: MarkType): boolean {
    return commands.isMarkActive(this.state, type)
  }

  /**
   * Applies an externally computed state transition as a normal transaction:
   * it lands on the undo stack and fires change/update events, exactly like a
   * keystroke. This is the entry point for programmatic actors — AI agents,
   * collaboration layers, custom tooling. Return null from `fn` to abort.
   */
  transact(fn: (state: EditorState) => EditorState | null, origin = 'external'): boolean {
    return this.apply(fn(this.state), origin)
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  private apply(next: EditorState | null, origin?: string): boolean {
    if (!next || next === this.state) return false
    this.dispatch(next, origin)
    return true
  }

  private dispatch(next: EditorState, origin?: string): void {
    const docChanged = next.doc !== this.state.doc
    if (docChanged) {
      const now = Date.now()
      const coalesce =
        origin === 'insertText' && this.lastOrigin === 'insertText' && now - this.lastPushTime < TYPING_COALESCE_MS
      if (!coalesce) {
        this.undoStack.push({ doc: this.state.doc, selection: this.state.selection })
        if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
        this.lastPushTime = now
      }
      this.lastOrigin = origin ?? null
      this.redoStack = []
    }
    this.state = next
    this.renderView()
    if (docChanged) {
      this.options.onChange?.(this)
      this.emit('change')
    }
    this.emit('update')
  }

  private renderView(): void {
    const documentRef = this.dom.ownerDocument
    this.dom.replaceChildren(...renderBlocks(documentRef, this.state.doc.children, []))
    const first = this.state.doc.children[0]
    const isEmpty =
      this.state.doc.children.length === 1 &&
      first?.type === 'paragraph' &&
      first.content.length === 0 &&
      (first.children?.length ?? 0) === 0
    if (isEmpty) this.dom.setAttribute('data-empty', 'true')
    else this.dom.removeAttribute('data-empty')
    if (this.hasFocus()) applyDOMSelection(this.dom, this.state.selection)
  }

  private hasFocus(): boolean {
    const active = this.dom.ownerDocument.activeElement
    return active != null && this.dom.contains(active)
  }

  // -------------------------------------------------------------------------
  // DOM event handling
  // -------------------------------------------------------------------------

  /**
   * Reads the DOM selection into the model. `selectionchange` fires
   * asynchronously (Chromium can delay it past the next key event), so input
   * handlers call this first to guarantee commands see the live selection.
   */
  private syncSelectionFromDOM(): void {
    const selection = readDOMSelection(this.dom)
    if (!selection || selectionsEqual(selection, this.state.selection)) return
    // A selection move cancels pending stored marks (Cmd+B with no typing).
    this.state = { ...this.state, selection, storedMarks: null }
    this.emit('update')
  }

  /** Inserts text, then gives markdown input rules a chance to transform it. */
  private insertTextWithRules(content: string): void {
    const inserted = commands.insertText(this.state, content)
    if (this.options.inputRules !== false) {
      const transformed = runInputRules(inserted, content)
      if (transformed) {
        // Commit the literal text first (coalescing with prior typing), then the
        // autoformat as its own undo step — so one undo restores the typed
        // syntax (e.g. `**bold**`) before a second removes the characters.
        this.apply(inserted, 'insertText')
        this.apply(transformed, 'inputRule')
        return
      }
    }
    this.apply(inserted, 'insertText')
  }

  private onBeforeInput = (event: InputEvent): void => {
    if (this.composing || event.inputType === 'insertCompositionText') return
    this.syncSelectionFromDOM()
    switch (event.inputType) {
      case 'insertText':
      case 'insertReplacementText': {
        event.preventDefault()
        const data = event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
        if (data) this.insertTextWithRules(data)
        break
      }
      case 'insertParagraph':
      case 'insertLineBreak': {
        event.preventDefault()
        const cellCtx = commands.cellContext(this.state.doc, this.state.selection.head.path)
        if (cellCtx && event.inputType === 'insertParagraph') {
          // Enter in a cell moves to the cell below, growing the table at the edge.
          this.moveRow(cellCtx)
          break
        }
        const block = blockAt(this.state.doc, this.state.selection.head.path)
        if (block?.type === 'codeBlock' && event.inputType === 'insertParagraph') {
          // Enter inside a code block inserts a newline; Enter on an empty
          // trailing line exits into a fresh paragraph.
          const head = this.state.selection.head
          const text = blockText(block)
          if (text.endsWith('\n') && head.offset === blockLength(block)) {
            this.transact((state) => {
              const trimmed = commands.deleteRange(
                state,
                { path: head.path, offset: head.offset - 1 },
                { path: head.path, offset: head.offset },
              )
              return commands.insertParagraphAfter(trimmed)
            }, 'exitCode')
          } else {
            this.commands.insertText('\n')
          }
          break
        }
        this.commands.splitBlock()
        break
      }
      case 'deleteContentBackward':
      case 'deleteWordBackward':
      case 'deleteSoftLineBackward':
        event.preventDefault()
        this.commands.deleteBackward()
        break
      case 'deleteContentForward':
      case 'deleteWordForward':
      case 'deleteSoftLineForward':
        event.preventDefault()
        this.commands.deleteForward()
        break
      case 'insertFromPaste':
      case 'insertFromDrop': {
        event.preventDefault()
        // Prefer rich HTML when the clipboard carries it; fall back to plain text.
        const html = event.dataTransfer?.getData('text/html')
        if (html) {
          const blocks = parseHTML(html, this.dom.ownerDocument)
          if (blocks.length > 0 && this.apply(commands.insertBlocks(this.state, blocks), 'paste')) break
        }
        const pasted = event.dataTransfer?.getData('text/plain') ?? ''
        if (pasted) this.commands.insertLines(pasted)
        break
      }
      case 'formatBold':
        event.preventDefault()
        this.commands.toggleBold()
        break
      case 'formatItalic':
        event.preventDefault()
        this.commands.toggleItalic()
        break
      case 'historyUndo':
        event.preventDefault()
        this.undo()
        break
      case 'historyRedo':
        event.preventDefault()
        this.redo()
        break
      default:
        // Anything the model doesn't understand must not mutate the DOM.
        event.preventDefault()
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.composing) return
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      this.syncSelectionFromDOM()
      const ctx = commands.cellContext(this.state.doc, this.state.selection.head.path)
      if (ctx) {
        event.preventDefault()
        this.moveCell(ctx, event.shiftKey ? -1 : 1)
        return
      }
      const block = blockAt(this.state.doc, this.state.selection.head.path)
      if (block?.type === 'listItem') {
        // Swallow Tab inside lists even when the indent doesn't apply —
        // moving focus out of the editor mid-list would be worse.
        event.preventDefault()
        if (event.shiftKey) this.commands.outdentListItem()
        else this.commands.indentListItem()
      }
      return
    }
    if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      // Esc selects the current block; pressing again walks up to the parent.
      // Widgets that use Esc (slash menu) intercept in the capture phase first.
      this.syncSelectionFromDOM()
      if (this.commands.selectBlock()) event.preventDefault()
      return
    }
    const mod = event.metaKey || event.ctrlKey
    if (!mod) return
    this.syncSelectionFromDOM()
    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      this.commands.toggleBold()
    } else if (key === 'i') {
      event.preventDefault()
      this.commands.toggleItalic()
    } else if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) this.redo()
      else this.undo()
    } else if (key === 'y') {
      event.preventDefault()
      this.redo()
    }
  }

  /**
   * IME composition (Korean, Japanese, Chinese, …) cannot be intercepted with
   * preventDefault, so the browser is allowed to compose directly in the DOM.
   * When composition ends, the composed text is applied to the model at the
   * selection captured at composition start, and the view is re-rendered from
   * the model — which also discards whatever the browser left in the DOM.
   */
  /** Tab navigation between cells, row-major; Tab past the last cell grows the table. */
  private moveCell(ctx: commands.CellContext, direction: 1 | -1): void {
    const tableBlock = blockAt(this.state.doc, ctx.tablePath)
    if (!tableBlock) return
    const rows = tableBlock.children ?? []
    const cols = rows[ctx.rowIndex]?.children?.length ?? 1
    let row = ctx.rowIndex
    let col = ctx.colIndex + direction
    if (col >= cols) {
      row += 1
      col = 0
    } else if (col < 0) {
      row -= 1
      col = (rows[row]?.children?.length ?? 1) - 1
    }
    if (row < 0) return
    if (row >= rows.length) {
      // Tab past the last cell: grow the table and land on the new row's first cell.
      if (this.commands.addTableRow()) this.placeCaretInCell([...ctx.tablePath, row, 0])
      return
    }
    this.placeCaretInCell([...ctx.tablePath, row, col])
  }

  /** Enter navigation: the cell below, adding a row at the bottom edge. */
  private moveRow(ctx: commands.CellContext): void {
    const tableBlock = blockAt(this.state.doc, ctx.tablePath)
    if (!tableBlock) return
    const rows = tableBlock.children ?? []
    if (ctx.rowIndex + 1 >= rows.length) {
      this.commands.addTableRow()
      return
    }
    this.placeCaretInCell([...ctx.tablePath, ctx.rowIndex + 1, ctx.colIndex])
  }

  private placeCaretInCell(cellPath: BlockPath): void {
    const cell = blockAt(this.state.doc, cellPath)
    if (!cell) return
    const offset = blockLength(cell)
    this.apply(commands.setSelection(this.state, collapsedSelection({ path: cellPath, offset })))
  }

  /** Checkbox clicks toggle the to-do in the model; the render syncs the input. */
  private onClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof HTMLElement) || !target.classList.contains('cwe-todo-box')) return
    event.preventDefault()
    const blockEl = target.closest('[data-path]')
    const attr = blockEl?.getAttribute('data-path')
    if (!attr) return
    const path = attr.split('.').map(Number)
    this.commands.toggleTodo(path)
  }

  private onFocus = (): void => {
    this.emit('focus')
  }

  private onBlur = (): void => {
    this.emit('blur')
  }

  private onCompositionStart = (): void => {
    this.composing = true
    this.compositionSelection = this.state.selection
  }

  private onCompositionEnd = (event: CompositionEvent): void => {
    this.composing = false
    const selection = this.compositionSelection
    this.compositionSelection = null
    if (selection) this.state = { ...this.state, selection }
    const data = event.data
    if (data) {
      this.commands.insertText(data)
    } else {
      // Cancelled composition: re-render to restore the model's DOM.
      this.renderView()
    }
  }

  private onSelectionChange = (): void => {
    if (this.composing || this.destroyed) return
    this.syncSelectionFromDOM()
  }
}
