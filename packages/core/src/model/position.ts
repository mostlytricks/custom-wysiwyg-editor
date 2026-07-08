import type { DocNode } from './types'
import { blockLength } from './spans'
import type { BlockPath } from './path'
import { blockAt, comparePaths } from './path'

/**
 * A position in the document: a path to a block in the tree plus a character
 * offset within that block's own inline text (spans are transparent — the
 * offset counts characters across all of them; child blocks have their own
 * paths and are never part of the parent's offset space).
 */
export interface Position {
  path: BlockPath
  offset: number
}

/** anchor = where the selection started, head = where the caret is. */
export interface SelectionRange {
  anchor: Position
  head: Position
}

export function comparePositions(a: Position, b: Position): -1 | 0 | 1 {
  const byPath = comparePaths(a.path, b.path)
  if (byPath !== 0) return byPath
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

/** Clamps each path component to an existing block, descending as far as the path goes. */
export function clampPath(docNode: DocNode, path: BlockPath): BlockPath {
  const out: number[] = []
  let blocks = docNode.children
  for (const component of path) {
    if (blocks.length === 0) break
    const index = Math.max(0, Math.min(component, blocks.length - 1))
    out.push(index)
    blocks = blocks[index]!.children ?? []
  }
  return out.length > 0 ? out : [0]
}

export function clampPosition(docNode: DocNode, pos: Position): Position {
  const path = clampPath(docNode, pos.path)
  const block = blockAt(docNode, path)
  const maxOffset = block ? blockLength(block) : 0
  const offset = Math.max(0, Math.min(pos.offset, maxOffset))
  return { path, offset }
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
