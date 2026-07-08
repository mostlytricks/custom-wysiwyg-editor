import { describe, expect, it } from 'vitest'
import {
  blockAt,
  blockText,
  createEditorState,
  deleteBackward,
  deleteForward,
  doc,
  heading,
  indentListItem,
  insertLines,
  insertText,
  listItem,
  outdentListItem,
  paragraph,
  selectAll,
  setAlign,
  setHeading,
  splitBlock,
  text,
  toggleList,
  toggleMark,
  type EditorState,
  type SelectionRange,
} from '@custom-wysiwyg/core'

function state(docNode = doc(), selection?: Partial<SelectionRange>): EditorState {
  const base = createEditorState(docNode)
  return selection ? { ...base, selection: { ...base.selection, ...selection } } : base
}

function caret(path: number[], offset: number): SelectionRange {
  return { anchor: { path, offset }, head: { path, offset } }
}

function range(anchor: [number[], number], head: [number[], number]): SelectionRange {
  return {
    anchor: { path: anchor[0], offset: anchor[1] },
    head: { path: head[0], offset: head[1] },
  }
}

const bold = { type: 'bold' } as const
const italic = { type: 'italic' } as const

describe('insertText', () => {
  it('inserts into an empty document', () => {
    const next = insertText(state(), 'Hello')
    expect(blockText(next.doc.children[0]!)).toBe('Hello')
    expect(next.selection.head).toEqual({ path: [0], offset: 5 })
  })

  it('inherits the marks of the character before the caret', () => {
    const s = state(doc(paragraph([text('ab', [bold])])), caret([0], 2))
    const next = insertText(s, 'c')
    expect(next.doc.children[0]!.content).toEqual([{ type: 'text', text: 'abc', marks: [bold] }])
  })

  it('replaces a selected range', () => {
    const s = state(doc(paragraph([text('hello world')])), range([[0], 6], [[0], 11]))
    const next = insertText(s, 'there')
    expect(blockText(next.doc.children[0]!)).toBe('hello there')
  })

  it('replaces a cross-block range by merging the blocks', () => {
    const s = state(doc(paragraph([text('first')]), paragraph([text('second')])), range([[0], 2], [[1], 3]))
    const next = insertText(s, 'X')
    expect(next.doc.children).toHaveLength(1)
    expect(blockText(next.doc.children[0]!)).toBe('fiXond')
  })
})

describe('toggleMark', () => {
  it('adds a mark to a range and removes it on the second toggle', () => {
    const s = state(doc(paragraph([text('hello')])), range([[0], 0], [[0], 5]))
    const marked = toggleMark(s, bold)
    expect(marked.doc.children[0]!.content).toEqual([{ type: 'text', text: 'hello', marks: [bold] }])
    const unmarked = toggleMark(marked, bold)
    expect(unmarked.doc.children[0]!.content).toEqual([{ type: 'text', text: 'hello', marks: [] }])
  })

  it('splits spans when marking part of a block', () => {
    const s = state(doc(paragraph([text('hello')])), range([[0], 1], [[0], 3]))
    const next = toggleMark(s, bold)
    expect(next.doc.children[0]!.content).toEqual([
      { type: 'text', text: 'h', marks: [] },
      { type: 'text', text: 'el', marks: [bold] },
      { type: 'text', text: 'lo', marks: [] },
    ])
  })

  it('adds the mark when only part of the range has it', () => {
    const s = state(doc(paragraph([text('he', [bold]), text('llo')])), range([[0], 0], [[0], 5]))
    const next = toggleMark(s, bold)
    expect(next.doc.children[0]!.content).toEqual([{ type: 'text', text: 'hello', marks: [bold] }])
  })

  it('stores marks on a collapsed selection and applies them to the next insert', () => {
    const s = state(doc(paragraph([text('hi')])), caret([0], 2))
    const toggled = toggleMark(s, italic)
    expect(toggled.storedMarks).toEqual([italic])
    const typed = insertText(toggled, '!')
    expect(typed.doc.children[0]!.content).toEqual([
      { type: 'text', text: 'hi', marks: [] },
      { type: 'text', text: '!', marks: [italic] },
    ])
  })
})

describe('splitBlock', () => {
  it('splits a paragraph at the caret', () => {
    const s = state(doc(paragraph([text('hello')])), caret([0], 2))
    const next = splitBlock(s)
    expect(next.doc.children).toHaveLength(2)
    expect(blockText(next.doc.children[0]!)).toBe('he')
    expect(blockText(next.doc.children[1]!)).toBe('llo')
    expect(next.selection.head).toEqual({ path: [1], offset: 0 })
  })

  it('starts a paragraph when splitting at the end of a heading', () => {
    const s = state(doc(heading(1, [text('Title')])), caret([0], 5))
    const next = splitBlock(s)
    expect(next.doc.children[1]!.type).toBe('paragraph')
  })

  it('keeps the heading type when splitting mid-heading', () => {
    const s = state(doc(heading(2, [text('Title')])), caret([0], 2))
    const next = splitBlock(s)
    expect(next.doc.children[1]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
  })
})

describe('deleteBackward', () => {
  it('deletes the character before the caret', () => {
    const s = state(doc(paragraph([text('ab')])), caret([0], 2))
    const next = deleteBackward(s)!
    expect(blockText(next.doc.children[0]!)).toBe('a')
  })

  it('merges with the previous block at a block start', () => {
    const s = state(doc(paragraph([text('ab')]), paragraph([text('cd')])), caret([1], 0))
    const next = deleteBackward(s)!
    expect(next.doc.children).toHaveLength(1)
    expect(blockText(next.doc.children[0]!)).toBe('abcd')
    expect(next.selection.head).toEqual({ path: [0], offset: 2 })
  })

  it('removes an empty previous block and keeps the current block type', () => {
    const s = state(doc(paragraph(), heading(1, [text('Title')])), caret([1], 0))
    const next = deleteBackward(s)!
    expect(next.doc.children).toHaveLength(1)
    expect(next.doc.children[0]!.type).toBe('heading')
  })

  it('returns null at the very start of the document', () => {
    const s = state(doc(paragraph([text('ab')])), caret([0], 0))
    expect(deleteBackward(s)).toBeNull()
  })
})

describe('block commands', () => {
  it('converts blocks in the selection to headings', () => {
    const s = state(doc(paragraph([text('a')]), paragraph([text('b')])), range([[0], 0], [[1], 1]))
    const next = setHeading(s, 2)
    expect(next.doc.children.every((b) => b.type === 'heading')).toBe(true)
  })

  it('sets alignment and preserves it across type changes', () => {
    const s = state(doc(paragraph([text('centered')])), caret([0], 0))
    const aligned = setAlign(s, 'center')
    expect(aligned.doc.children[0]!.attrs?.align).toBe('center')
    const asHeading = setHeading(aligned, 1)
    expect(asHeading.doc.children[0]!.attrs).toEqual({ level: 1, align: 'center' })
  })
})

describe('insertLines', () => {
  it('splits pasted multi-line text into blocks', () => {
    const s = state(doc(paragraph([text('x')])), caret([0], 1))
    const next = insertLines(s, 'a\nb\r\nc')
    expect(next.doc.children.map((b) => blockText(b))).toEqual(['xa', 'b', 'c'])
  })
})

describe('block tree', () => {
  const nested = () =>
    doc(
      paragraph([text('parent')], undefined, [paragraph([text('child one')]), paragraph([text('child two')])]),
      paragraph([text('after')]),
    )

  it('addresses nested blocks by path', () => {
    const d = nested()
    expect(blockText(blockAt(d, [0])!)).toBe('parent')
    expect(blockText(blockAt(d, [0, 1])!)).toBe('child two')
    expect(blockAt(d, [0, 2])).toBeNull()
  })

  it('inserts text into a nested block', () => {
    const s = state(nested(), caret([0, 0], 5))
    const next = insertText(s, 'X')
    expect(blockText(blockAt(next.doc, [0, 0])!)).toBe('childX one')
    expect(next.selection.head).toEqual({ path: [0, 0], offset: 6 })
  })

  it('merges a nested range across depths, hoisting survivors', () => {
    const s = state(nested(), range([[0], 3], [[0, 0], 5]))
    const next = insertText(s, '-')
    // "par" + "-" + " one"; child two survives as the parent's child.
    expect(blockText(blockAt(next.doc, [0])!)).toBe('par- one')
    expect(blockText(blockAt(next.doc, [0, 0])!)).toBe('child two')
    expect(blockAt(next.doc, [0, 1])).toBeNull()
  })

  it('backspace at the start of a first child merges into the parent text', () => {
    const s = state(nested(), caret([0, 0], 0))
    const next = deleteBackward(s)!
    expect(blockText(blockAt(next.doc, [0])!)).toBe('parentchild one')
    expect(next.selection.head).toEqual({ path: [0], offset: 6 })
    expect(blockText(blockAt(next.doc, [0, 0])!)).toBe('child two')
  })

  it('backspace into an empty parent hoists its children', () => {
    const d = doc(paragraph([], undefined, [heading(2, [text('kept')])]), paragraph([text('after')]))
    const s = state(d, caret([0, 0], 0))
    const next = deleteBackward(s)!
    expect(next.doc.children.map((b) => blockText(b))).toEqual(['kept', 'after'])
    expect(next.doc.children[0]!.type).toBe('heading')
    expect(next.selection.head).toEqual({ path: [0], offset: 0 })
  })

  it('delete-forward at the end of a parent merges its first child up', () => {
    const s = state(nested(), caret([0], 6))
    const next = deleteForward(s)!
    expect(blockText(blockAt(next.doc, [0])!)).toBe('parentchild one')
    expect(blockText(blockAt(next.doc, [0, 0])!)).toBe('child two')
    expect(next.selection.head).toEqual({ path: [0], offset: 6 })
  })

  it('splitting a block with children moves them to the new block', () => {
    const s = state(nested(), caret([0], 3))
    const next = splitBlock(s)
    expect(blockText(blockAt(next.doc, [0])!)).toBe('par')
    expect(blockAt(next.doc, [0])!.children).toBeUndefined()
    expect(blockText(blockAt(next.doc, [1])!)).toBe('ent')
    expect(blockText(blockAt(next.doc, [1, 0])!)).toBe('child one')
  })

  it('toggles a mark across a range spanning depths', () => {
    const s = state(nested(), range([[0], 0], [[0, 1], 5]))
    const next = toggleMark(s, bold)
    expect(blockAt(next.doc, [0])!.content).toEqual([{ type: 'text', text: 'parent', marks: [bold] }])
    expect(blockAt(next.doc, [0, 0])!.content).toEqual([{ type: 'text', text: 'child one', marks: [bold] }])
    expect(blockAt(next.doc, [0, 1])!.content).toEqual([
      { type: 'text', text: 'child', marks: [bold] },
      { type: 'text', text: ' two', marks: [] },
    ])
  })

  it('select-all reaches the deepest last block', () => {
    const d = doc(paragraph([text('a')], undefined, [paragraph([text('deep')])]))
    const next = selectAll(state(d))
    expect(next.selection.anchor).toEqual({ path: [0], offset: 0 })
    expect(next.selection.head).toEqual({ path: [0, 0], offset: 4 })
  })

  it('converts nested blocks to headings without touching their children', () => {
    const s = state(nested(), range([[0], 0], [[0, 1], 5]))
    const next = setHeading(s, 3)
    expect(blockAt(next.doc, [0])!.type).toBe('heading')
    expect(blockAt(next.doc, [0, 0])!.type).toBe('heading')
    expect(blockAt(next.doc, [1])!.type).toBe('paragraph')
    expect(blockText(blockAt(next.doc, [0, 1])!)).toBe('child two')
  })
})

describe('lists', () => {
  const bullets = () =>
    doc(listItem('bullet', [text('one')]), listItem('bullet', [text('two')]), listItem('bullet', [text('three')]))

  it('toggleList converts paragraphs to list items and back', () => {
    const s = state(doc(paragraph([text('a')]), paragraph([text('b')])), range([[0], 0], [[1], 1]))
    const listed = toggleList(s, 'bullet')
    expect(listed.doc.children.map((b) => b.type)).toEqual(['listItem', 'listItem'])
    const back = toggleList(listed, 'bullet')
    expect(back.doc.children.map((b) => b.type)).toEqual(['paragraph', 'paragraph'])
  })

  it('toggleList converts a mixed range to the requested kind', () => {
    const s = state(doc(listItem('bullet', [text('a')]), paragraph([text('b')])), range([[0], 0], [[1], 1]))
    const next = toggleList(s, 'ordered')
    expect(next.doc.children.every((b) => b.type === 'listItem' && b.attrs.kind === 'ordered')).toBe(true)
  })

  it('indent makes the item the last child of its previous sibling', () => {
    const s = state(bullets(), caret([1], 2))
    const next = indentListItem(s)!
    expect(next).not.toBeNull()
    expect(blockText(blockAt(next.doc, [0, 0])!)).toBe('two')
    expect(next.selection.head).toEqual({ path: [0, 0], offset: 2 })
    expect(next.doc.children).toHaveLength(2)
  })

  it('indent does not apply on a first item or outside lists', () => {
    expect(indentListItem(state(bullets(), caret([0], 0)))).toBeNull()
    expect(indentListItem(state(doc(paragraph([text('p')]), paragraph([text('q')])), caret([1], 0)))).toBeNull()
  })

  it('indent keeps the moved item own children', () => {
    const d = doc(listItem('bullet', [text('one')]), listItem('bullet', [text('two')], undefined, [listItem('bullet', [text('deep')])]))
    const next = indentListItem(state(d, caret([1], 0)))!
    expect(blockText(blockAt(next.doc, [0, 0])!)).toBe('two')
    expect(blockText(blockAt(next.doc, [0, 0, 0])!)).toBe('deep')
  })

  it('outdent moves the item after its parent and adopts following siblings', () => {
    const d = doc(
      listItem('bullet', [text('parent')], undefined, [
        listItem('bullet', [text('first')]),
        listItem('bullet', [text('second')]),
        listItem('bullet', [text('third')]),
      ]),
    )
    const next = outdentListItem(state(d, caret([0, 1], 3)))!
    expect(blockText(blockAt(next.doc, [1])!)).toBe('second')
    expect(next.selection.head).toEqual({ path: [1], offset: 3 })
    // "third" must stay after "second" in document order → it became a child.
    expect(blockText(blockAt(next.doc, [1, 0])!)).toBe('third')
    expect(blockAt(next.doc, [0])!.children).toHaveLength(1)
  })

  it('outdent does not apply at the top level', () => {
    expect(outdentListItem(state(bullets(), caret([1], 0)))).toBeNull()
  })

  it('Enter mid-item splits into two list items', () => {
    const s = state(bullets(), caret([1], 1))
    const next = splitBlock(s)
    expect(next.doc.children.map((b) => b.type)).toEqual(['listItem', 'listItem', 'listItem', 'listItem'])
    expect(blockText(next.doc.children[1]!)).toBe('t')
    expect(blockText(next.doc.children[2]!)).toBe('wo')
  })

  it('Enter on an empty top-level item exits the list into a paragraph', () => {
    const d = doc(listItem('bullet', [text('one')]), listItem('bullet'))
    const next = splitBlock(state(d, caret([1], 0)))
    expect(next.doc.children[1]!.type).toBe('paragraph')
    expect(next.doc.children).toHaveLength(2)
  })

  it('Enter on an empty nested item outdents instead', () => {
    const d = doc(listItem('bullet', [text('parent')], undefined, [listItem('bullet')]))
    const next = splitBlock(state(d, caret([0, 0], 0)))
    expect(next.doc.children).toHaveLength(2)
    expect(next.doc.children[1]!.type).toBe('listItem')
  })

  it('Backspace at the start of a top-level item strips the marker', () => {
    const next = deleteBackward(state(bullets(), caret([1], 0)))!
    expect(next.doc.children[1]!.type).toBe('paragraph')
    expect(blockText(next.doc.children[1]!)).toBe('two')
  })

  it('Backspace at the start of a nested item outdents', () => {
    const d = doc(listItem('bullet', [text('parent')], undefined, [listItem('bullet', [text('kid')])]))
    const next = deleteBackward(state(d, caret([0, 0], 0)))!
    expect(next.doc.children).toHaveLength(2)
    expect(blockText(next.doc.children[1]!)).toBe('kid')
  })
})
