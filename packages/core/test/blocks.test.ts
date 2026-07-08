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
  insertDivider,
  insertText,
  paragraph,
  quote,
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
