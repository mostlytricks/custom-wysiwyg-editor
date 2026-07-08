import { describe, expect, it } from 'vitest'
import {
  blockText,
  createEditorState,
  deleteBackward,
  doc,
  heading,
  insertLines,
  insertText,
  paragraph,
  setAlign,
  setHeading,
  splitBlock,
  text,
  toggleMark,
  type EditorState,
  type SelectionRange,
} from '@custom-wysiwyg/core'

function state(docNode = doc(), selection?: Partial<SelectionRange>): EditorState {
  const base = createEditorState(docNode)
  return selection ? { ...base, selection: { ...base.selection, ...selection } } : base
}

function caret(block: number, offset: number): SelectionRange {
  return { anchor: { block, offset }, head: { block, offset } }
}

function range(anchor: [number, number], head: [number, number]): SelectionRange {
  return {
    anchor: { block: anchor[0], offset: anchor[1] },
    head: { block: head[0], offset: head[1] },
  }
}

const bold = { type: 'bold' } as const
const italic = { type: 'italic' } as const

describe('insertText', () => {
  it('inserts into an empty document', () => {
    const next = insertText(state(), 'Hello')
    expect(blockText(next.doc.children[0]!)).toBe('Hello')
    expect(next.selection.head).toEqual({ block: 0, offset: 5 })
  })

  it('inherits the marks of the character before the caret', () => {
    const s = state(doc(paragraph([text('ab', [bold])])), caret(0, 2))
    const next = insertText(s, 'c')
    expect(next.doc.children[0]!.children).toEqual([{ type: 'text', text: 'abc', marks: [bold] }])
  })

  it('replaces a selected range', () => {
    const s = state(doc(paragraph([text('hello world')])), range([0, 6], [0, 11]))
    const next = insertText(s, 'there')
    expect(blockText(next.doc.children[0]!)).toBe('hello there')
  })

  it('replaces a cross-block range by merging the blocks', () => {
    const s = state(doc(paragraph([text('first')]), paragraph([text('second')])), range([0, 2], [1, 3]))
    const next = insertText(s, 'X')
    expect(next.doc.children).toHaveLength(1)
    expect(blockText(next.doc.children[0]!)).toBe('fiXond')
  })
})

describe('toggleMark', () => {
  it('adds a mark to a range and removes it on the second toggle', () => {
    const s = state(doc(paragraph([text('hello')])), range([0, 0], [0, 5]))
    const marked = toggleMark(s, bold)
    expect(marked.doc.children[0]!.children).toEqual([{ type: 'text', text: 'hello', marks: [bold] }])
    const unmarked = toggleMark(marked, bold)
    expect(unmarked.doc.children[0]!.children).toEqual([{ type: 'text', text: 'hello', marks: [] }])
  })

  it('splits spans when marking part of a block', () => {
    const s = state(doc(paragraph([text('hello')])), range([0, 1], [0, 3]))
    const next = toggleMark(s, bold)
    expect(next.doc.children[0]!.children).toEqual([
      { type: 'text', text: 'h', marks: [] },
      { type: 'text', text: 'el', marks: [bold] },
      { type: 'text', text: 'lo', marks: [] },
    ])
  })

  it('adds the mark when only part of the range has it', () => {
    const s = state(doc(paragraph([text('he', [bold]), text('llo')])), range([0, 0], [0, 5]))
    const next = toggleMark(s, bold)
    expect(next.doc.children[0]!.children).toEqual([{ type: 'text', text: 'hello', marks: [bold] }])
  })

  it('stores marks on a collapsed selection and applies them to the next insert', () => {
    const s = state(doc(paragraph([text('hi')])), caret(0, 2))
    const toggled = toggleMark(s, italic)
    expect(toggled.storedMarks).toEqual([italic])
    const typed = insertText(toggled, '!')
    expect(typed.doc.children[0]!.children).toEqual([
      { type: 'text', text: 'hi', marks: [] },
      { type: 'text', text: '!', marks: [italic] },
    ])
  })
})

describe('splitBlock', () => {
  it('splits a paragraph at the caret', () => {
    const s = state(doc(paragraph([text('hello')])), caret(0, 2))
    const next = splitBlock(s)
    expect(next.doc.children).toHaveLength(2)
    expect(blockText(next.doc.children[0]!)).toBe('he')
    expect(blockText(next.doc.children[1]!)).toBe('llo')
    expect(next.selection.head).toEqual({ block: 1, offset: 0 })
  })

  it('starts a paragraph when splitting at the end of a heading', () => {
    const s = state(doc(heading(1, [text('Title')])), caret(0, 5))
    const next = splitBlock(s)
    expect(next.doc.children[1]!.type).toBe('paragraph')
  })

  it('keeps the heading type when splitting mid-heading', () => {
    const s = state(doc(heading(2, [text('Title')])), caret(0, 2))
    const next = splitBlock(s)
    expect(next.doc.children[1]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
  })
})

describe('deleteBackward', () => {
  it('deletes the character before the caret', () => {
    const s = state(doc(paragraph([text('ab')])), caret(0, 2))
    const next = deleteBackward(s)!
    expect(blockText(next.doc.children[0]!)).toBe('a')
  })

  it('merges with the previous block at a block start', () => {
    const s = state(doc(paragraph([text('ab')]), paragraph([text('cd')])), caret(1, 0))
    const next = deleteBackward(s)!
    expect(next.doc.children).toHaveLength(1)
    expect(blockText(next.doc.children[0]!)).toBe('abcd')
    expect(next.selection.head).toEqual({ block: 0, offset: 2 })
  })

  it('removes an empty previous block and keeps the current block type', () => {
    const s = state(doc(paragraph(), heading(1, [text('Title')])), caret(1, 0))
    const next = deleteBackward(s)!
    expect(next.doc.children).toHaveLength(1)
    expect(next.doc.children[0]!.type).toBe('heading')
  })

  it('returns null at the very start of the document', () => {
    const s = state(doc(paragraph([text('ab')])), caret(0, 0))
    expect(deleteBackward(s)).toBeNull()
  })
})

describe('block commands', () => {
  it('converts blocks in the selection to headings', () => {
    const s = state(doc(paragraph([text('a')]), paragraph([text('b')])), range([0, 0], [1, 1]))
    const next = setHeading(s, 2)
    expect(next.doc.children.every((b) => b.type === 'heading')).toBe(true)
  })

  it('sets alignment and preserves it across type changes', () => {
    const s = state(doc(paragraph([text('centered')])), caret(0, 0))
    const aligned = setAlign(s, 'center')
    expect(aligned.doc.children[0]!.attrs?.align).toBe('center')
    const asHeading = setHeading(aligned, 1)
    expect(asHeading.doc.children[0]!.attrs).toEqual({ level: 1, align: 'center' })
  })
})

describe('insertLines', () => {
  it('splits pasted multi-line text into blocks', () => {
    const s = state(doc(paragraph([text('x')])), caret(0, 1))
    const next = insertLines(s, 'a\nb\r\nc')
    expect(next.doc.children.map((b) => blockText(b))).toEqual(['xa', 'b', 'c'])
  })
})
