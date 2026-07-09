import { describe, expect, it } from 'vitest'
import {
  blockAt,
  blockText,
  callout,
  codeBlock,
  createEditorState,
  deleteBackward,
  divider,
  doc,
  emptyTable,
  heading,
  insertBlocks,
  insertDivider,
  insertText,
  moveBlock,
  paragraph,
  quote,
  selectBlock,
  setCodeBlock,
  setQuote,
  setTodo,
  splitBlock,
  text,
  todo,
  toggleMark,
  toggleTodo,
  type EditorState,
  type SelectionRange,
} from '@custom-wysiwyg/core'

function state(docNode = doc(), selection?: Partial<SelectionRange>): EditorState {
  const base = createEditorState(docNode)
  return selection ? { ...base, selection: { ...base.selection, ...selection } } : base
}

const caret = (path: number[], offset: number): SelectionRange => ({
  anchor: { path, offset },
  head: { path, offset },
})

describe('to-dos', () => {
  it('setTodo converts and toggleTodo flips checked', () => {
    const converted = setTodo(state(doc(paragraph([text('task')])), caret([0], 0)))
    expect(converted.doc.children[0]).toMatchObject({ type: 'todo', attrs: { checked: false } })
    const toggled = toggleTodo(converted)!
    expect(toggled.doc.children[0]).toMatchObject({ attrs: { checked: true } })
  })

  it('toggleTodo targets an explicit path and rejects non-todos', () => {
    const d = doc(paragraph([text('p')]), todo(false, [text('t')]))
    const toggled = toggleTodo(state(d, caret([0], 0)), [1])!
    expect(toggled.doc.children[1]).toMatchObject({ attrs: { checked: true } })
    expect(toggleTodo(state(d, caret([0], 0)))).toBeNull()
  })

  it('splitting a checked todo starts the new one unchecked', () => {
    const s = state(doc(todo(true, [text('ab')])), caret([0], 1))
    const next = splitBlock(s)
    expect(next.doc.children[0]).toMatchObject({ attrs: { checked: true } })
    expect(next.doc.children[1]).toMatchObject({ type: 'todo', attrs: { checked: false } })
  })

  it('Enter on an empty todo exits to a paragraph', () => {
    const next = splitBlock(state(doc(todo(false)), caret([0], 0)))
    expect(next.doc.children[0]!.type).toBe('paragraph')
  })
})

describe('quotes and callouts', () => {
  it('setQuote converts and Backspace at start strips the chrome', () => {
    const quoted = setQuote(state(doc(paragraph([text('wise')])), caret([0], 0)))
    expect(quoted.doc.children[0]!.type).toBe('quote')
    const stripped = deleteBackward({ ...quoted, selection: caret([0], 0) })!
    expect(stripped.doc.children[0]!.type).toBe('paragraph')
    expect(blockText(stripped.doc.children[0]!)).toBe('wise')
  })

  it('splitting a callout keeps the emoji on both halves', () => {
    const s = state(doc(callout([text('ab')], { emoji: '🔥' })), caret([0], 1))
    const next = splitBlock(s)
    expect(next.doc.children[0]).toMatchObject({ type: 'callout', attrs: { emoji: '🔥' } })
    expect(next.doc.children[1]).toMatchObject({ type: 'callout', attrs: { emoji: '🔥' } })
  })
})

describe('code blocks', () => {
  it('setCodeBlock strips marks into verbatim text', () => {
    const s = state(doc(paragraph([text('bo', [{ type: 'bold' }]), text('ld')])), caret([0], 0))
    const next = setCodeBlock(s)
    expect(next.doc.children[0]).toMatchObject({ type: 'codeBlock' })
    expect(next.doc.children[0]!.content).toEqual([{ type: 'text', text: 'bold', marks: [] }])
  })

  it('marks never attach inside a code block', () => {
    const s = state(doc(codeBlock('let x = 1')), {
      anchor: { path: [0], offset: 0 },
      head: { path: [0], offset: 9 },
    })
    const next = toggleMark(s, { type: 'bold' })
    expect(next.doc.children[0]!.content[0]!.marks).toEqual([])
  })

  it('newlines live inside the block content', () => {
    const s = state(doc(codeBlock('a')), caret([0], 1))
    const next = insertText(s, '\nb')
    expect(blockText(next.doc.children[0]!)).toBe('a\nb')
    expect(next.doc.children).toHaveLength(1)
  })
})

describe('dividers', () => {
  it('insertDivider converts an empty paragraph and adds a caret paragraph', () => {
    const next = insertDivider(state(doc(paragraph()), caret([0], 0)))
    expect(next.doc.children.map((b) => b.type)).toEqual(['divider', 'paragraph'])
    expect(next.selection.head).toEqual({ path: [1], offset: 0 })
  })

  it('insertDivider after a non-empty block', () => {
    const next = insertDivider(state(doc(paragraph([text('above')])), caret([0], 5)))
    expect(next.doc.children.map((b) => b.type)).toEqual(['paragraph', 'divider', 'paragraph'])
  })

  it('Backspace after a divider removes it', () => {
    const d = doc(paragraph([text('a')]), divider(), paragraph([text('b')]))
    const next = deleteBackward(state(d, caret([2], 0)))!
    expect(next.doc.children.map((b) => b.type)).toEqual(['paragraph', 'paragraph'])
  })

  it('text never enters a divider', () => {
    const s = state(doc(divider(), paragraph()), caret([0], 0))
    expect(insertText(s, 'x')).toBe(s)
    expect(blockAt(splitBlock(s).doc, [0])!.type).toBe('divider')
  })
})

describe('moveBlock', () => {
  const three = () => doc(paragraph([text('a')]), paragraph([text('b')]), paragraph([text('c')]))

  it('moves a block after a later sibling', () => {
    const s = state(three())
    const next = moveBlock(s, [0], [2], 'after')!
    expect(next.doc.children.map((b) => blockText(b))).toEqual(['b', 'c', 'a'])
    expect(next.selection.head).toEqual({ path: [2], offset: 0 })
  })

  it('moves a block before an earlier sibling', () => {
    const s = state(three())
    const next = moveBlock(s, [2], [0], 'before')!
    expect(next.doc.children.map((b) => blockText(b))).toEqual(['c', 'a', 'b'])
  })

  it('carries the subtree along', () => {
    const d = doc(paragraph([text('solo')]), quote([text('q')], undefined, [paragraph([text('kid')])]))
    const next = moveBlock(state(d), [1], [0], 'before')!
    expect(next.doc.children[0]!.type).toBe('quote')
    expect(blockText(blockAt(next.doc, [0, 0])!)).toBe('kid')
  })

  it('rejects no-op, descendant, and table-structure moves', () => {
    const s = state(three())
    expect(moveBlock(s, [0], [0], 'after')).toBeNull()
    const nested = state(doc(quote([text('q')], undefined, [paragraph([text('kid')])])))
    expect(moveBlock(nested, [0], [0, 0], 'after')).toBeNull()
    const withTable = state(doc(paragraph([text('p')]), emptyTable(2, 2)))
    expect(moveBlock(withTable, [0], [1, 0, 0], 'after')).toBeNull()
    expect(moveBlock(withTable, [1], [0], 'before')).not.toBeNull() // whole table CAN move
  })
})

describe('selectBlock', () => {
  it('selects the block subtree at the caret', () => {
    const d = doc(quote([text('top')], undefined, [paragraph([text('kid')])]), paragraph([text('after')]))
    const next = selectBlock(state(d, caret([0], 1)))!
    expect(next.selection.anchor).toEqual({ path: [0], offset: 0 })
    expect(next.selection.head).toEqual({ path: [0, 0], offset: 3 })
  })

  it('escalates to the parent when the block is already selected', () => {
    const d = doc(quote([text('top')], undefined, [paragraph([text('kid')])]))
    const first = selectBlock(state(d, caret([0, 0], 1)))!
    expect(first.selection.anchor.path).toEqual([0, 0])
    const second = selectBlock(first)!
    expect(second.selection.anchor.path).toEqual([0])
    expect(second.selection.head).toEqual({ path: [0, 0], offset: 3 })
  })

  it('stops at the cell wall inside tables', () => {
    const d = doc(emptyTable(2, 2))
    const withText = insertText(state(d, caret([0, 0, 0], 0)), 'hi')
    const next = selectBlock(withText)!
    expect(next.selection.anchor).toEqual({ path: [0, 0, 0], offset: 0 })
    expect(next.selection.head).toEqual({ path: [0, 0, 0], offset: 2 })
    // Escalation never leaves the cell.
    const again = selectBlock(next)!
    expect(again.selection.anchor.path).toEqual([0, 0, 0])
  })
})

describe('insertBlocks', () => {
  it('splices a single paragraph inline at the caret', () => {
    const s = state(doc(paragraph([text('hello world')])), caret([0], 5))
    const next = insertBlocks(s, [paragraph([text(' pasted', [{ type: 'bold' }])])])
    expect(next.doc.children).toHaveLength(1)
    expect(next.doc.children[0]!.content).toEqual([
      { type: 'text', text: 'hello', marks: [] },
      { type: 'text', text: ' pasted', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' world', marks: [] },
    ])
    expect(next.selection.head).toEqual({ path: [0], offset: 12 })
  })

  it('replaces an empty paragraph with the pasted blocks', () => {
    const s = state(doc(paragraph([text('before')]), paragraph()), caret([1], 0))
    const next = insertBlocks(s, [heading(1, [text('Title')]), paragraph([text('body')])])
    expect(next.doc.children.map((b) => b.type)).toEqual(['paragraph', 'heading', 'paragraph'])
    expect(next.selection.head).toEqual({ path: [2], offset: 4 })
  })

  it('splits a non-empty block around multi-block content', () => {
    const s = state(doc(paragraph([text('headtail')])), caret([0], 4))
    const next = insertBlocks(s, [quote([text('q')]), paragraph([text('p')])])
    expect(next.doc.children.map((b) => b.type)).toEqual(['paragraph', 'quote', 'paragraph', 'paragraph'])
    expect(blockText(next.doc.children[0]!)).toBe('head')
    expect(blockText(next.doc.children[3]!)).toBe('tail')
  })

  it('refuses multi-block pastes inside a table cell but allows inline ones', () => {
    const d = doc(emptyTable(2, 2))
    const s = state(d, caret([0, 0, 0], 0))
    expect(insertBlocks(s, [paragraph([text('x')]), paragraph([text('y')])])).toBe(s)
    const inline = insertBlocks(s, [paragraph([text('cell')])])
    expect(blockText(blockAt(inline.doc, [0, 0, 0])!)).toBe('cell')
  })
})
