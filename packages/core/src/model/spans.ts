import type { BlockNode, Mark, MarkType, TextSpan } from './types'

export function marksEqual(a: Mark, b: Mark): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'link' && b.type === 'link') return a.attrs.href === b.attrs.href
  if (
    (a.type === 'color' || a.type === 'highlight' || a.type === 'fontSize' || a.type === 'fontFamily') &&
    a.type === b.type
  ) {
    return a.attrs.value === b.attrs.value
  }
  return true
}

export function markSetsEqual(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false
  return a.every((m) => b.some((n) => marksEqual(m, n)))
}

export function hasMarkType(marks: Mark[], type: MarkType): boolean {
  return marks.some((m) => m.type === type)
}

export function getMark<T extends MarkType>(marks: Mark[], type: T): Extract<Mark, { type: T }> | undefined {
  return marks.find((m): m is Extract<Mark, { type: T }> => m.type === type)
}

/** Drops empty spans and merges adjacent spans that carry identical marks. */
export function normalizeSpans(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = []
  for (const span of spans) {
    if (span.text.length === 0) continue
    const last = out[out.length - 1]
    if (last && markSetsEqual(last.marks, span.marks)) {
      out[out.length - 1] = { ...last, text: last.text + span.text }
    } else {
      out.push(span)
    }
  }
  return out
}

export function spansLength(spans: TextSpan[]): number {
  return spans.reduce((sum, span) => sum + span.text.length, 0)
}

/** Length of a block's own inline text (child blocks are separate positions). */
export function blockLength(block: BlockNode): number {
  return spansLength(block.content)
}

export function blockText(block: BlockNode): string {
  return block.content.map((span) => span.text).join('')
}

/** Extracts the spans covering [from, to) as character offsets, splitting spans at the boundaries. */
export function sliceSpans(spans: TextSpan[], from: number, to: number): TextSpan[] {
  const out: TextSpan[] = []
  let pos = 0
  for (const span of spans) {
    const end = pos + span.text.length
    const start = Math.max(from, pos)
    const stop = Math.min(to, end)
    if (stop > start) {
      out.push({ type: 'text', text: span.text.slice(start - pos, stop - pos), marks: span.marks })
    }
    pos = end
  }
  return out
}

/**
 * The marks a character typed at `offset` should inherit: the marks of the
 * character before the caret, or of the first character when at the start.
 */
export function marksAtOffset(block: BlockNode, offset: number): Mark[] {
  if (block.content.length === 0) return []
  const at = offset > 0 ? offset - 1 : 0
  let pos = 0
  for (const span of block.content) {
    const end = pos + span.text.length
    if (at >= pos && at < end) return span.marks
    pos = end
  }
  const last = block.content[block.content.length - 1]
  return last ? last.marks : []
}
