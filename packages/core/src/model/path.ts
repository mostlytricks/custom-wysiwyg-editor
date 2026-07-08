import type { BlockNode, DocNode } from './types'

/**
 * Paths address blocks in the recursive tree: each entry indexes a `children`
 * array, starting at doc.children. `[0]` is the first top-level block,
 * `[0, 1]` the second child of that block. Document order is lexicographic
 * with the parent before its descendants — exactly array comparison.
 */
export type BlockPath = number[]

export function comparePaths(a: BlockPath, b: BlockPath): -1 | 0 | 1 {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i]!
    const y = b[i]!
    if (x !== y) return x < y ? -1 : 1
  }
  if (a.length !== b.length) return a.length < b.length ? -1 : 1
  return 0
}

export function pathsEqual(a: BlockPath, b: BlockPath): boolean {
  return comparePaths(a, b) === 0
}

/** Whether `ancestor` is a proper prefix of `path` (or equal to it). */
export function isAncestorOrSelf(ancestor: BlockPath, path: BlockPath): boolean {
  if (ancestor.length > path.length) return false
  return ancestor.every((component, i) => component === path[i])
}

export function parentPath(path: BlockPath): BlockPath {
  return path.slice(0, -1)
}

export function siblingAfter(path: BlockPath): BlockPath {
  const last = path[path.length - 1] ?? 0
  return [...path.slice(0, -1), last + 1]
}

export function blockAt(docNode: DocNode, path: BlockPath): BlockNode | null {
  let blocks: BlockNode[] = docNode.children
  let block: BlockNode | null = null
  for (const index of path) {
    block = blocks[index] ?? null
    if (!block) return null
    blocks = block.children ?? []
  }
  return block
}

/** Returns a new doc with the block at `path` replaced by `map(block)`. */
export function replaceBlockAt(docNode: DocNode, path: BlockPath, map: (block: BlockNode) => BlockNode): DocNode {
  function replaceIn(blocks: BlockNode[], depth: number): BlockNode[] {
    const index = path[depth]
    const target = index != null ? blocks[index] : undefined
    if (index == null || !target) return blocks
    const next = blocks.slice()
    next[index] =
      depth === path.length - 1
        ? map(target)
        : { ...target, children: replaceIn(target.children ?? [], depth + 1) }
    return next
  }
  return { ...docNode, children: replaceIn(docNode.children, 0) }
}

/** All blocks in document order (depth-first, parent before children). */
export function* blockEntries(docNode: DocNode): Generator<{ path: BlockPath; block: BlockNode }> {
  function* visit(blocks: BlockNode[], prefix: BlockPath): Generator<{ path: BlockPath; block: BlockNode }> {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!
      const path = [...prefix, i]
      yield { path, block }
      if (block.children && block.children.length > 0) yield* visit(block.children, path)
    }
  }
  yield* visit(docNode.children, [])
}

/** Blocks whose paths fall in [from, to], inclusive, in document order. */
export function* blocksInRange(
  docNode: DocNode,
  from: BlockPath,
  to: BlockPath,
): Generator<{ path: BlockPath; block: BlockNode }> {
  for (const entry of blockEntries(docNode)) {
    if (comparePaths(entry.path, from) < 0) continue
    if (comparePaths(entry.path, to) > 0) return
    yield entry
  }
}

export function firstPath(): BlockPath {
  return [0]
}

/** The last block in document order: the deepest last descendant. */
export function lastPath(docNode: DocNode): BlockPath {
  const path: number[] = []
  let blocks: BlockNode[] = docNode.children
  while (blocks.length > 0) {
    const index = blocks.length - 1
    path.push(index)
    blocks = blocks[index]!.children ?? []
  }
  return path.length > 0 ? path : [0]
}

/** The block before `path` in document order, or null at the document start. */
export function previousPath(docNode: DocNode, path: BlockPath): BlockPath | null {
  let previous: BlockPath | null = null
  for (const entry of blockEntries(docNode)) {
    if (comparePaths(entry.path, path) >= 0) return previous
    previous = entry.path
  }
  return previous
}

/** The block after `path` in document order, or null at the document end. */
export function nextPath(docNode: DocNode, path: BlockPath): BlockPath | null {
  for (const entry of blockEntries(docNode)) {
    if (comparePaths(entry.path, path) > 0) return entry.path
  }
  return null
}

/**
 * Removes the block at `path` (with its subtree) and returns the new doc.
 * The caller is responsible for re-homing any children that should survive.
 */
export function removeBlockAt(docNode: DocNode, path: BlockPath): DocNode {
  function removeIn(blocks: BlockNode[], depth: number): BlockNode[] {
    const index = path[depth]
    const target = index != null ? blocks[index] : undefined
    if (index == null || !target) return blocks
    if (depth === path.length - 1) return [...blocks.slice(0, index), ...blocks.slice(index + 1)]
    const next = blocks.slice()
    next[index] = { ...target, children: removeIn(target.children ?? [], depth + 1) }
    return next
  }
  return { ...docNode, children: removeIn(docNode.children, 0) }
}

/** Replaces the block at `path` with a run of blocks (used to hoist children). */
export function spliceBlocksAt(docNode: DocNode, path: BlockPath, replacement: BlockNode[]): DocNode {
  function spliceIn(blocks: BlockNode[], depth: number): BlockNode[] {
    const index = path[depth]
    const target = index != null ? blocks[index] : undefined
    if (index == null || !target) return blocks
    if (depth === path.length - 1) return [...blocks.slice(0, index), ...replacement, ...blocks.slice(index + 1)]
    const next = blocks.slice()
    next[index] = { ...target, children: spliceIn(target.children ?? [], depth + 1) }
    return next
  }
  return { ...docNode, children: spliceIn(docNode.children, 0) }
}

/** Inserts a block as the next sibling of the block at `path`. */
export function insertBlockAfter(docNode: DocNode, path: BlockPath, block: BlockNode): DocNode {
  function insertIn(blocks: BlockNode[], depth: number): BlockNode[] {
    const index = path[depth]
    const target = index != null ? blocks[index] : undefined
    if (index == null || !target) return blocks
    if (depth === path.length - 1) return [...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)]
    const next = blocks.slice()
    next[index] = { ...target, children: insertIn(target.children ?? [], depth + 1) }
    return next
  }
  return { ...docNode, children: insertIn(docNode.children, 0) }
}

/**
 * Adjusts a path after the block at `removed` was deleted: any path component
 * that indexed a later sibling in the same array shifts down by one. Paths
 * inside the removed subtree are the caller's problem (they no longer exist).
 */
export function adjustPathAfterRemoval(path: BlockPath, removed: BlockPath): BlockPath {
  const parent = removed.slice(0, -1)
  if (!isAncestorOrSelf(parent, path) || path.length < removed.length) return path
  const removedIndex = removed[removed.length - 1]!
  const component = path[removed.length - 1]!
  if (component <= removedIndex) return path
  const next = path.slice()
  next[removed.length - 1] = component - 1
  return next
}
