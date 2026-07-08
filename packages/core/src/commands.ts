import type { Alignment, BlockNode, DocNode, HeadingAttrs, HeadingLevel, Mark, MarkType } from './model/types'
import type { Position, SelectionRange } from './model/position'
import { clampPosition, collapsedSelection, comparePositions, orderedRange } from './model/position'
import { blockLength, marksAtOffset, marksEqual, normalizeSpans, sliceSpans } from './model/spans'
import type { EditorState } from './state'

/**
 * Commands are pure functions: EditorState in, EditorState out (or null when
 * the command doesn't apply). They never touch the DOM, which is what makes
 * the model testable without a browser and lets external actors (toolbars,
 * AI agents, collaboration layers) drive the editor through the same door
 * as keystrokes.
 */

function replaceBlock(docNode: DocNode, index: number, block: BlockNode): DocNode {
  const children = docNode.children.slice()
  children[index] = block
  return { ...docNode, children }
}

/** Deletes [from, to). A cross-block range merges the endpoint blocks into one. */
export function deleteRangeInDoc(docNode: DocNode, from: Position, to: Position): DocNode {
  const blocks = docNode.children
  const first = blocks[from.block]
  const last = blocks[to.block]
  if (!first || !last) return docNode
  if (from.block === to.block) {
    const children = normalizeSpans([
      ...sliceSpans(first.children, 0, from.offset),
      ...sliceSpans(first.children, to.offset, blockLength(first)),
    ])
    return replaceBlock(docNode, from.block, { ...first, children })
  }
  const merged: BlockNode = {
    ...first,
    children: normalizeSpans([
      ...sliceSpans(first.children, 0, from.offset),
      ...sliceSpans(last.children, to.offset, blockLength(last)),
    ]),
  }
  return { ...docNode, children: [...blocks.slice(0, from.block), merged, ...blocks.slice(to.block + 1)] }
}

export function insertTextInDoc(docNode: DocNode, pos: Position, content: string, marks: Mark[]): DocNode {
  const block = docNode.children[pos.block]
  if (!block) return docNode
  const children = normalizeSpans([
    ...sliceSpans(block.children, 0, pos.offset),
    { type: 'text', text: content, marks },
    ...sliceSpans(block.children, pos.offset, blockLength(block)),
  ])
  return replaceBlock(docNode, pos.block, { ...block, children })
}

export function insertText(state: EditorState, content: string): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  let docNode = state.doc
  if (comparePositions(from, to) !== 0) docNode = deleteRangeInDoc(docNode, from, to)
  const block = docNode.children[from.block]
  if (!block) return state
  const marks = state.storedMarks ?? marksAtOffset(block, from.offset)
  docNode = insertTextInDoc(docNode, from, content, marks)
  const caret = { block: from.block, offset: from.offset + content.length }
  return { doc: docNode, selection: collapsedSelection(caret), storedMarks: state.storedMarks }
}

export function deleteBackward(state: EditorState): EditorState | null {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) !== 0) {
    return { doc: deleteRangeInDoc(state.doc, from, to), selection: collapsedSelection(from), storedMarks: null }
  }
  if (from.offset > 0) {
    const pos = { block: from.block, offset: from.offset - 1 }
    return { doc: deleteRangeInDoc(state.doc, pos, from), selection: collapsedSelection(pos), storedMarks: null }
  }
  if (from.block === 0) return null
  const prev = state.doc.children[from.block - 1]
  if (!prev) return null
  const prevLen = blockLength(prev)
  if (prevLen === 0) {
    // Backspacing into an empty block removes the empty block and keeps the
    // current block's type (so a heading under an empty paragraph survives).
    const children = [...state.doc.children.slice(0, from.block - 1), ...state.doc.children.slice(from.block)]
    return {
      doc: { ...state.doc, children },
      selection: collapsedSelection({ block: from.block - 1, offset: 0 }),
      storedMarks: null,
    }
  }
  const pos = { block: from.block - 1, offset: prevLen }
  return { doc: deleteRangeInDoc(state.doc, pos, from), selection: collapsedSelection(pos), storedMarks: null }
}

export function deleteForward(state: EditorState): EditorState | null {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) !== 0) {
    return { doc: deleteRangeInDoc(state.doc, from, to), selection: collapsedSelection(from), storedMarks: null }
  }
  const block = state.doc.children[from.block]
  if (!block) return null
  if (from.offset < blockLength(block)) {
    const end = { block: from.block, offset: from.offset + 1 }
    return { doc: deleteRangeInDoc(state.doc, from, end), selection: collapsedSelection(from), storedMarks: null }
  }
  if (from.block >= state.doc.children.length - 1) return null
  const start = { block: from.block + 1, offset: 0 }
  return { doc: deleteRangeInDoc(state.doc, from, start), selection: collapsedSelection(from), storedMarks: null }
}

/**
 * Splits the current block at the caret (Enter). Pressing Enter at the end of
 * a heading starts a paragraph, matching what every mainstream editor does.
 */
export function splitBlock(state: EditorState): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  let docNode = state.doc
  if (comparePositions(from, to) !== 0) docNode = deleteRangeInDoc(docNode, from, to)
  const block = docNode.children[from.block]
  if (!block) return state
  const len = blockLength(block)
  const before = normalizeSpans(sliceSpans(block.children, 0, from.offset))
  const after = normalizeSpans(sliceSpans(block.children, from.offset, len))
  const align = block.attrs?.align
  const newBlock: BlockNode =
    block.type === 'heading' && from.offset === len
      ? { type: 'paragraph', ...(align ? { attrs: { align } } : {}), children: [] }
      : { ...block, children: after }
  const children = [
    ...docNode.children.slice(0, from.block),
    { ...block, children: before },
    newBlock,
    ...docNode.children.slice(from.block + 1),
  ]
  return {
    doc: { ...docNode, children },
    selection: collapsedSelection({ block: from.block + 1, offset: 0 }),
    storedMarks: null,
  }
}

/** Inserts plain text that may contain newlines, e.g. from paste. */
export function insertLines(state: EditorState, content: string): EditorState {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let next = insertText(state, lines[0] ?? '')
  for (let i = 1; i < lines.length; i++) {
    next = splitBlock(next)
    const line = lines[i]
    if (line) next = insertText(next, line)
  }
  return next
}

function rangeHasMark(docNode: DocNode, from: Position, to: Position, type: MarkType): boolean {
  let sawText = false
  for (let b = from.block; b <= to.block; b++) {
    const block = docNode.children[b]
    if (!block) continue
    const localFrom = b === from.block ? from.offset : 0
    const localTo = b === to.block ? to.offset : blockLength(block)
    for (const span of sliceSpans(block.children, localFrom, localTo)) {
      sawText = true
      if (!span.marks.some((m) => m.type === type)) return false
    }
  }
  return sawText
}

function applyMarkToRange(docNode: DocNode, from: Position, to: Position, mark: Mark, add: boolean): DocNode {
  let out = docNode
  for (let b = from.block; b <= to.block; b++) {
    const block = out.children[b]
    if (!block) continue
    const len = blockLength(block)
    const localFrom = b === from.block ? from.offset : 0
    const localTo = b === to.block ? to.offset : len
    const middle = sliceSpans(block.children, localFrom, localTo).map((span) => {
      const withoutType = span.marks.filter((m) => m.type !== mark.type)
      return { ...span, marks: add ? [...withoutType, mark] : withoutType }
    })
    const children = normalizeSpans([
      ...sliceSpans(block.children, 0, localFrom),
      ...middle,
      ...sliceSpans(block.children, localTo, len),
    ])
    out = replaceBlock(out, b, { ...block, children })
  }
  return out
}

/**
 * Toggles a mark. Over a range, adds the mark unless every character already
 * has it. With a collapsed selection, toggles the stored marks that the next
 * typed character will inherit.
 */
export function toggleMark(state: EditorState, mark: Mark): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) === 0) {
    const block = state.doc.children[from.block]
    if (!block) return state
    const current = state.storedMarks ?? marksAtOffset(block, from.offset)
    const has = current.some((m) => marksEqual(m, mark))
    const storedMarks = has ? current.filter((m) => !marksEqual(m, mark)) : [...current, mark]
    return { ...state, storedMarks }
  }
  const add = !rangeHasMark(state.doc, from, to, mark.type)
  const docNode = applyMarkToRange(state.doc, from, to, mark, add)
  return { doc: docNode, selection: state.selection, storedMarks: null }
}

function mapSelectedBlocks(state: EditorState, map: (block: BlockNode) => BlockNode): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  const children = state.doc.children.map((block, i) => (i >= from.block && i <= to.block ? map(block) : block))
  return { ...state, doc: { ...state.doc, children } }
}

export function setHeading(state: EditorState, level: HeadingLevel): EditorState {
  return mapSelectedBlocks(state, (block) => {
    const attrs: HeadingAttrs = { level, ...(block.attrs?.align ? { align: block.attrs.align } : {}) }
    return { type: 'heading', attrs, children: block.children }
  })
}

export function setParagraph(state: EditorState): EditorState {
  return mapSelectedBlocks(state, (block) => ({
    type: 'paragraph',
    ...(block.attrs?.align ? { attrs: { align: block.attrs.align } } : {}),
    children: block.children,
  }))
}

export function setAlign(state: EditorState, align: Alignment): EditorState {
  return mapSelectedBlocks(state, (block) => {
    if (block.type === 'heading') {
      const attrs: HeadingAttrs = { level: block.attrs.level, ...(align !== 'left' ? { align } : {}) }
      return { ...block, attrs }
    }
    return align !== 'left' ? { ...block, attrs: { align } } : { type: 'paragraph', children: block.children }
  })
}

/** Moves the selection without touching the document. */
export function setSelection(state: EditorState, selection: SelectionRange): EditorState {
  return {
    ...state,
    selection: {
      anchor: clampPosition(state.doc, selection.anchor),
      head: clampPosition(state.doc, selection.head),
    },
    storedMarks: null,
  }
}

/** Deletes an explicit range and leaves the caret at its start. */
export function deleteRange(state: EditorState, from: Position, to: Position): EditorState {
  const range = orderedRange(state.doc, { anchor: from, head: to })
  return {
    doc: deleteRangeInDoc(state.doc, range.from, range.to),
    selection: collapsedSelection(range.from),
    storedMarks: null,
  }
}

/**
 * Whether the mark is active at the selection: over a range, true when every
 * character has it; collapsed, true when the next typed character would get it.
 */
export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) === 0) {
    const block = state.doc.children[from.block]
    if (!block) return false
    const marks = state.storedMarks ?? marksAtOffset(block, from.offset)
    return marks.some((m) => m.type === type)
  }
  return rangeHasMark(state.doc, from, to, type)
}

export function selectAll(state: EditorState): EditorState {
  const lastIndex = state.doc.children.length - 1
  const last = state.doc.children[lastIndex]
  const selection: SelectionRange = {
    anchor: { block: 0, offset: 0 },
    head: { block: lastIndex, offset: last ? blockLength(last) : 0 },
  }
  return { ...state, selection, storedMarks: null }
}
