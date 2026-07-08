import type {
  Alignment,
  BlockNode,
  DocNode,
  HeadingAttrs,
  HeadingLevel,
  ListItemAttrs,
  ListKind,
  Mark,
  MarkType,
} from './model/types'
import type { Position, SelectionRange } from './model/position'
import { clampPosition, collapsedSelection, comparePositions, orderedRange } from './model/position'
import { blockLength, marksAtOffset, marksEqual, normalizeSpans, sliceSpans } from './model/spans'
import type { BlockPath } from './model/path'
import {
  adjustPathAfterRemoval,
  blockAt,
  blocksInRange,
  comparePaths,
  insertBlockAfter,
  isAncestorOrSelf,
  lastPath,
  parentPath,
  pathsEqual,
  previousPath,
  nextPath,
  removeBlockAt,
  replaceBlockAt,
  siblingAfter,
  spliceBlocksAt,
} from './model/path'
import type { EditorState } from './state'

/**
 * Commands are pure functions: EditorState in, EditorState out (or null when
 * the command doesn't apply). They never touch the DOM, which is what makes
 * the model testable without a browser and lets external actors (toolbars,
 * AI agents, collaboration layers) drive the editor through the same door
 * as keystrokes.
 */

/** Copies a block, replacing its nested children (omitting the key when empty). */
function withChildren<T extends BlockNode>(block: T, children: BlockNode[] | undefined): T {
  const next = { ...block }
  if (children && children.length > 0) next.children = children
  else delete next.children
  return next
}

/**
 * Deletes [from, to). A cross-block range merges the endpoint blocks into
 * one: the `from` block keeps its identity and gains the tail of the `to`
 * block. Blocks strictly inside the range are removed; their descendants
 * that lie *after* the range (e.g. the `to` block's children) are hoisted
 * into the removed block's slot, preserving document order.
 */
export function deleteRangeInDoc(docNode: DocNode, from: Position, to: Position): DocNode {
  const first = blockAt(docNode, from.path)
  const last = blockAt(docNode, to.path)
  if (!first || !last) return docNode
  if (pathsEqual(from.path, to.path)) {
    const content = normalizeSpans([
      ...sliceSpans(first.content, 0, from.offset),
      ...sliceSpans(first.content, to.offset, blockLength(first)),
    ])
    return replaceBlockAt(docNode, from.path, (block) => ({ ...block, content }))
  }
  const mergedContent = normalizeSpans([
    ...sliceSpans(first.content, 0, from.offset),
    ...sliceSpans(last.content, to.offset, blockLength(last)),
  ])

  /** Survivors of a dropped subtree: descendants past `to.path`, in document order. */
  function salvage(block: BlockNode, path: BlockPath): BlockNode[] {
    const out: BlockNode[] = []
    const children = block.children ?? []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!
      const childPath = [...path, i]
      if (comparePaths(childPath, to.path) > 0) out.push(child)
      else out.push(...salvage(child, childPath))
    }
    return out
  }

  function rebuild(blocks: BlockNode[], prefix: BlockPath): BlockNode[] {
    const out: BlockNode[] = []
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!
      const path = [...prefix, i]
      if (isAncestorOrSelf(path, from.path)) {
        const children = rebuild(block.children ?? [], path)
        const rebuilt = withChildren(block, children)
        out.push(pathsEqual(path, from.path) ? { ...rebuilt, content: mergedContent } : rebuilt)
      } else if (comparePaths(path, from.path) < 0 || comparePaths(path, to.path) > 0) {
        out.push(block)
      } else {
        // Inside (from, to]: the block goes; survivors take its slot.
        out.push(...salvage(block, path))
      }
    }
    return out
  }

  return { ...docNode, children: rebuild(docNode.children, []) }
}

export function insertTextInDoc(docNode: DocNode, pos: Position, content: string, marks: Mark[]): DocNode {
  const block = blockAt(docNode, pos.path)
  if (!block) return docNode
  const spans = normalizeSpans([
    ...sliceSpans(block.content, 0, pos.offset),
    { type: 'text', text: content, marks },
    ...sliceSpans(block.content, pos.offset, blockLength(block)),
  ])
  return replaceBlockAt(docNode, pos.path, (target) => ({ ...target, content: spans }))
}

export function insertText(state: EditorState, content: string): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  let docNode = state.doc
  if (comparePositions(from, to) !== 0) docNode = deleteRangeInDoc(docNode, from, to)
  const block = blockAt(docNode, from.path)
  if (!block) return state
  const marks = state.storedMarks ?? marksAtOffset(block, from.offset)
  docNode = insertTextInDoc(docNode, from, content, marks)
  const caret = { path: from.path, offset: from.offset + content.length }
  return { doc: docNode, selection: collapsedSelection(caret), storedMarks: state.storedMarks }
}

export function deleteBackward(state: EditorState): EditorState | null {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) !== 0) {
    return { doc: deleteRangeInDoc(state.doc, from, to), selection: collapsedSelection(from), storedMarks: null }
  }
  if (from.offset > 0) {
    const pos = { path: from.path, offset: from.offset - 1 }
    return { doc: deleteRangeInDoc(state.doc, pos, from), selection: collapsedSelection(pos), storedMarks: null }
  }
  const atStartBlock = blockAt(state.doc, from.path)
  if (atStartBlock?.type === 'listItem') {
    // Backspace at the start of a list item removes the marker before any
    // merging: outdent when nested, otherwise convert to a paragraph.
    return outdentListItem(state) ?? { ...setParagraph(state), storedMarks: null }
  }
  const prevPath = previousPath(state.doc, from.path)
  if (!prevPath) return null
  const prev = blockAt(state.doc, prevPath)
  if (!prev) return null
  const prevLen = blockLength(prev)
  if (prevLen === 0) {
    // Backspacing into an empty block removes the empty block and keeps the
    // current block's type (so a heading under an empty paragraph survives).
    if (isAncestorOrSelf(prevPath, from.path)) {
      // The empty block is the parent: hoist its children into its slot.
      const hoisted = spliceBlocksAt(state.doc, prevPath, prev.children ?? [])
      const depth = prevPath.length - 1
      const newPath = from.path.slice()
      newPath.splice(depth, 2, prevPath[depth]! + from.path[depth + 1]!)
      return { doc: hoisted, selection: collapsedSelection({ path: newPath, offset: 0 }), storedMarks: null }
    }
    return {
      doc: removeBlockAt(state.doc, prevPath),
      selection: collapsedSelection({ path: adjustPathAfterRemoval(from.path, prevPath), offset: 0 }),
      storedMarks: null,
    }
  }
  const pos = { path: prevPath, offset: prevLen }
  return { doc: deleteRangeInDoc(state.doc, pos, from), selection: collapsedSelection(pos), storedMarks: null }
}

export function deleteForward(state: EditorState): EditorState | null {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) !== 0) {
    return { doc: deleteRangeInDoc(state.doc, from, to), selection: collapsedSelection(from), storedMarks: null }
  }
  const block = blockAt(state.doc, from.path)
  if (!block) return null
  if (from.offset < blockLength(block)) {
    const end = { path: from.path, offset: from.offset + 1 }
    return { doc: deleteRangeInDoc(state.doc, from, end), selection: collapsedSelection(from), storedMarks: null }
  }
  const next = nextPath(state.doc, from.path)
  if (!next) return null
  const start = { path: next, offset: 0 }
  return { doc: deleteRangeInDoc(state.doc, from, start), selection: collapsedSelection(from), storedMarks: null }
}

/**
 * Splits the current block at the caret (Enter). The new block becomes the
 * next sibling and takes the original's nested children (they render after
 * the split point, so document order is preserved). Pressing Enter at the
 * end of a heading starts a paragraph, matching what every mainstream
 * editor does.
 */
export function splitBlock(state: EditorState): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  let docNode = state.doc
  if (comparePositions(from, to) !== 0) docNode = deleteRangeInDoc(docNode, from, to)
  const block = blockAt(docNode, from.path)
  if (!block) return state
  const len = blockLength(block)
  if (block.type === 'listItem' && len === 0 && comparePositions(from, to) === 0) {
    // Enter on an empty list item exits the list: outdent when nested,
    // otherwise turn the item into a paragraph (Notion behavior).
    return outdentListItem(state) ?? setParagraph(state)
  }
  const before = normalizeSpans(sliceSpans(block.content, 0, from.offset))
  const after = normalizeSpans(sliceSpans(block.content, from.offset, len))
  const align = block.attrs?.align
  const newBlock: BlockNode =
    block.type === 'heading' && from.offset === len
      ? withChildren({ type: 'paragraph', ...(align ? { attrs: { align } } : {}), content: [] }, block.children)
      : withChildren({ ...block, content: after }, block.children)
  docNode = replaceBlockAt(docNode, from.path, (target) => withChildren({ ...target, content: before }, undefined))
  docNode = insertBlockAfter(docNode, from.path, newBlock)
  const newPath = [...from.path.slice(0, -1), from.path[from.path.length - 1]! + 1]
  return {
    doc: docNode,
    selection: collapsedSelection({ path: newPath, offset: 0 }),
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
  for (const { path, block } of blocksInRange(docNode, from.path, to.path)) {
    const localFrom = pathsEqual(path, from.path) ? from.offset : 0
    const localTo = pathsEqual(path, to.path) ? to.offset : blockLength(block)
    for (const span of sliceSpans(block.content, localFrom, localTo)) {
      sawText = true
      if (!span.marks.some((m) => m.type === type)) return false
    }
  }
  return sawText
}

function applyMarkToRange(docNode: DocNode, from: Position, to: Position, mark: Mark, add: boolean): DocNode {
  let out = docNode
  for (const { path, block } of blocksInRange(docNode, from.path, to.path)) {
    const len = blockLength(block)
    const localFrom = pathsEqual(path, from.path) ? from.offset : 0
    const localTo = pathsEqual(path, to.path) ? to.offset : len
    const middle = sliceSpans(block.content, localFrom, localTo).map((span) => {
      const withoutType = span.marks.filter((m) => m.type !== mark.type)
      return { ...span, marks: add ? [...withoutType, mark] : withoutType }
    })
    const content = normalizeSpans([
      ...sliceSpans(block.content, 0, localFrom),
      ...middle,
      ...sliceSpans(block.content, localTo, len),
    ])
    out = replaceBlockAt(out, path, (target) => ({ ...target, content }))
  }
  return out
}

/**
 * Sets a mark unconditionally — a valued mark (color, highlight, fontSize,
 * link) already present with a different value is **replaced**, never
 * toggled off. Collapsed selections stage it in storedMarks.
 */
export function applyMark(state: EditorState, mark: Mark): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) === 0) {
    const block = blockAt(state.doc, from.path)
    if (!block) return state
    const current = state.storedMarks ?? marksAtOffset(block, from.offset)
    return { ...state, storedMarks: [...current.filter((m) => m.type !== mark.type), mark] }
  }
  return { doc: applyMarkToRange(state.doc, from, to, mark, true), selection: state.selection, storedMarks: null }
}

/** Removes every mark of `type` from the selection (or from the stored marks when collapsed). */
export function removeMark(state: EditorState, type: MarkType): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) === 0) {
    const block = blockAt(state.doc, from.path)
    if (!block) return state
    const current = state.storedMarks ?? marksAtOffset(block, from.offset)
    return { ...state, storedMarks: current.filter((m) => m.type !== type) }
  }
  // applyMarkToRange with add=false only uses the mark's type for filtering,
  // so a minimal carrier of the right type is enough.
  const carrier = { type } as Mark
  return { doc: applyMarkToRange(state.doc, from, to, carrier, false), selection: state.selection, storedMarks: null }
}

/**
 * Toggles a mark. Over a range, adds the mark unless every character already
 * has it. With a collapsed selection, toggles the stored marks that the next
 * typed character will inherit.
 */
export function toggleMark(state: EditorState, mark: Mark): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (comparePositions(from, to) === 0) {
    const block = blockAt(state.doc, from.path)
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
  function walk(blocks: BlockNode[], prefix: BlockPath): BlockNode[] {
    return blocks.map((block, i) => {
      const path = [...prefix, i]
      const children = block.children ? walk(block.children, path) : undefined
      const inRange = comparePaths(path, from.path) >= 0 && comparePaths(path, to.path) <= 0
      const base = children ? withChildren(block, children) : block
      return inRange ? withChildren(map(base), base.children) : base
    })
  }
  return { ...state, doc: { ...state.doc, children: walk(state.doc.children, []) } }
}

export function setHeading(state: EditorState, level: HeadingLevel): EditorState {
  return mapSelectedBlocks(state, (block) => {
    const attrs: HeadingAttrs = { level, ...(block.attrs?.align ? { align: block.attrs.align } : {}) }
    return withChildren({ type: 'heading', attrs, content: block.content }, block.children)
  })
}

export function setParagraph(state: EditorState): EditorState {
  return mapSelectedBlocks(state, (block) =>
    withChildren(
      {
        type: 'paragraph',
        ...(block.attrs?.align ? { attrs: { align: block.attrs.align } } : {}),
        content: block.content,
      },
      block.children,
    ),
  )
}

export function setAlign(state: EditorState, align: Alignment): EditorState {
  return mapSelectedBlocks(state, (block) => {
    if (block.type === 'heading') {
      const attrs: HeadingAttrs = { level: block.attrs.level, ...(align !== 'left' ? { align } : {}) }
      return { ...block, attrs }
    }
    if (block.type === 'listItem') {
      const attrs: ListItemAttrs = { kind: block.attrs.kind, ...(align !== 'left' ? { align } : {}) }
      return { ...block, attrs }
    }
    if (align !== 'left') return { ...block, attrs: { align } }
    const { attrs: _attrs, ...rest } = block
    return rest
  })
}

/** Converts the selected blocks to list items of `kind` (idempotent). */
export function setList(state: EditorState, kind: ListKind): EditorState {
  return mapSelectedBlocks(state, (block) => {
    const attrs: ListItemAttrs = { kind, ...(block.attrs?.align ? { align: block.attrs.align } : {}) }
    return withChildren({ type: 'listItem', attrs, content: block.content }, block.children)
  })
}

/**
 * Toggles the selected blocks between list items of `kind` and paragraphs:
 * converts to `kind` unless every selected block already is one.
 */
export function toggleList(state: EditorState, kind: ListKind): EditorState {
  const { from, to } = orderedRange(state.doc, state.selection)
  let allKind = true
  for (const { block } of blocksInRange(state.doc, from.path, to.path)) {
    if (!(block.type === 'listItem' && block.attrs.kind === kind)) {
      allKind = false
      break
    }
  }
  return allKind ? setParagraph(state) : setList(state, kind)
}

/**
 * Indents the caret's list item one level (Tab): the item — with its own
 * children — becomes the last child of its previous sibling list item.
 * Applies only with the selection inside a single list item that has a list
 * item as its previous sibling.
 */
export function indentListItem(state: EditorState): EditorState | null {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (!pathsEqual(from.path, to.path)) return null
  const path = from.path
  const block = blockAt(state.doc, path)
  if (!block || block.type !== 'listItem') return null
  const index = path[path.length - 1]!
  if (index === 0) return null
  const prevSiblingPath = [...path.slice(0, -1), index - 1]
  const prevSibling = blockAt(state.doc, prevSiblingPath)
  if (!prevSibling || prevSibling.type !== 'listItem') return null
  const newPath = [...prevSiblingPath, prevSibling.children?.length ?? 0]
  let docNode = removeBlockAt(state.doc, path)
  docNode = replaceBlockAt(docNode, prevSiblingPath, (target) =>
    withChildren(target, [...(target.children ?? []), block]),
  )
  return {
    doc: docNode,
    selection: {
      anchor: { path: newPath, offset: state.selection.anchor.offset },
      head: { path: newPath, offset: state.selection.head.offset },
    },
    storedMarks: state.storedMarks,
  }
}

/**
 * Outdents the caret's list item one level (Shift+Tab): the item becomes the
 * next sibling of its parent, and its former following siblings — which must
 * stay after it in document order — become its children.
 */
export function outdentListItem(state: EditorState): EditorState | null {
  const { from, to } = orderedRange(state.doc, state.selection)
  if (!pathsEqual(from.path, to.path)) return null
  const path = from.path
  if (path.length < 2) return null
  const block = blockAt(state.doc, path)
  if (!block || block.type !== 'listItem') return null
  const parent = parentPath(path)
  const parentBlock = blockAt(state.doc, parent)
  if (!parentBlock) return null
  const index = path[path.length - 1]!
  const siblings = parentBlock.children ?? []
  const following = siblings.slice(index + 1)
  const moved = withChildren(block, [...(block.children ?? []), ...following])
  let docNode = replaceBlockAt(state.doc, parent, (target) => withChildren(target, siblings.slice(0, index)))
  docNode = insertBlockAfter(docNode, parent, moved)
  const newPath = siblingAfter(parent)
  return {
    doc: docNode,
    selection: {
      anchor: { path: newPath, offset: state.selection.anchor.offset },
      head: { path: newPath, offset: state.selection.head.offset },
    },
    storedMarks: state.storedMarks,
  }
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
    const block = blockAt(state.doc, from.path)
    if (!block) return false
    const marks = state.storedMarks ?? marksAtOffset(block, from.offset)
    return marks.some((m) => m.type === type)
  }
  return rangeHasMark(state.doc, from, to, type)
}

export function selectAll(state: EditorState): EditorState {
  const last = lastPath(state.doc)
  const lastBlock = blockAt(state.doc, last)
  const selection: SelectionRange = {
    anchor: { path: [0], offset: 0 },
    head: { path: last, offset: lastBlock ? blockLength(lastBlock) : 0 },
  }
  return { ...state, selection, storedMarks: null }
}
