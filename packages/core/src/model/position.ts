import type { DocNode } from './types'
import { blockLength } from './spans'

/**
 * A position in the document: a block index plus a character offset within
 * that block's text (spans are transparent — the offset counts characters
 * across all of them).
 */
export interface Position {
  block: number
  offset: number
}

/** anchor = where the selection started, head = where the caret is. */
export interface SelectionRange {
  anchor: Position
  head: Position
}

export function comparePositions(a: Position, b: Position): -1 | 0 | 1 {
  if (a.block !== b.block) return a.block < b.block ? -1 : 1
  if (a.offset !== b.offset) return a.offset < b.offset ? -1 : 1
  return 0
}

export function positionsEqual(a: Position, b: Position): boolean {
  return comparePositions(a, b) === 0
}

export function selectionsEqual(a: SelectionRange, b: SelectionRange): boolean {
  return positionsEqual(a.anchor, b.anchor) && positionsEqual(a.head, b.head)
}

export function selectionIsCollapsed(sel: SelectionRange): boolean {
  return positionsEqual(sel.anchor, sel.head)
}

export function collapsedSelection(pos: Position): SelectionRange {
  return { anchor: pos, head: pos }
}

export function clampPosition(docNode: DocNode, pos: Position): Position {
  const blockCount = docNode.children.length
  const block = Math.max(0, Math.min(pos.block, blockCount - 1))
  const blockNode = docNode.children[block]
  const maxOffset = blockNode ? blockLength(blockNode) : 0
  const offset = Math.max(0, Math.min(pos.offset, maxOffset))
  return { block, offset }
}

/**
 * Returns the selection's endpoints in document order, clamped to valid
 * positions in the given document.
 */
export function orderedRange(docNode: DocNode, sel: SelectionRange): { from: Position; to: Position } {
  const anchor = clampPosition(docNode, sel.anchor)
  const head = clampPosition(docNode, sel.head)
  return comparePositions(anchor, head) <= 0 ? { from: anchor, to: head } : { from: head, to: anchor }
}
