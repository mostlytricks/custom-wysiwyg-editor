import { describe, expect, it } from 'vitest'
import {
  applyMark,
  createEditorState,
  doc,
  insertText,
  paragraph,
  removeMark,
  text,
  type EditorState,
  type Mark,
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
const range = (from: number, to: number): SelectionRange => ({
  anchor: { path: [0], offset: from },
  head: { path: [0], offset: to },
})

const red: Mark = { type: 'color', attrs: { value: '#e03e3e' } }
const blue: Mark = { type: 'color', attrs: { value: '#0b6e99' } }
const small: Mark = { type: 'fontSize', attrs: { value: 'small' } }
const serif: Mark = { type: 'fontFamily', attrs: { value: 'serif' } }
const mono: Mark = { type: 'fontFamily', attrs: { value: 'mono' } }
const bold: Mark = { type: 'bold' }

describe('valued marks (formatting SPEC)', () => {
  it('applying a color over an existing color replaces it, never toggles off', () => {
    const s = state(doc(paragraph([text('hot', [red])])), range(0, 3))
    const next = applyMark(s, blue)
    expect(next.doc.children[0]!.content).toEqual([{ type: 'text', text: 'hot', marks: [blue] }])
    // Applying the same value again is a no-op set, not a removal.
    const again = applyMark(next, blue)
    expect(again.doc.children[0]!.content[0]!.marks).toEqual([blue])
  })

  it('removeMark strips only the requested type', () => {
    const s = state(doc(paragraph([text('x', [red, bold, small])])), range(0, 1))
    const next = removeMark(s, 'color')
    expect(next.doc.children[0]!.content[0]!.marks).toEqual([bold, small])
  })

  it('applying a font family over an existing one replaces it, never toggles off', () => {
    const s = state(doc(paragraph([text('type', [serif])])), range(0, 4))
    const next = applyMark(s, mono)
    expect(next.doc.children[0]!.content).toEqual([{ type: 'text', text: 'type', marks: [mono] }])
    const again = applyMark(next, mono)
    expect(again.doc.children[0]!.content[0]!.marks).toEqual([mono])
  })

  it('removeMark(fontFamily) restores the default font, keeping other marks', () => {
    const s = state(doc(paragraph([text('x', [mono, bold])])), range(0, 1))
    const next = removeMark(s, 'fontFamily')
    expect(next.doc.children[0]!.content[0]!.marks).toEqual([bold])
  })

  it('collapsed selections stage valued marks in storedMarks', () => {
    const s = state(doc(paragraph([text('hi')])), caret([0], 2))
    const staged = applyMark(s, red)
    expect(staged.storedMarks).toEqual([red])
    const typed = insertText(staged, '!')
    expect(typed.doc.children[0]!.content).toEqual([
      { type: 'text', text: 'hi', marks: [] },
      { type: 'text', text: '!', marks: [red] },
    ])
  })

  it('collapsed replacement swaps the staged value', () => {
    const s = state(doc(paragraph([text('hi')])), caret([0], 2))
    const staged = applyMark(applyMark(s, red), blue)
    expect(staged.storedMarks).toEqual([blue])
  })

  it('collapsed removeMark clears the staged mark, keeping inherited ones', () => {
    const s = state(doc(paragraph([text('hi', [bold, red])])), caret([0], 2))
    const next = removeMark(s, 'color')
    expect(next.storedMarks).toEqual([bold])
  })

  it('spans with different colors stay separate; same colors merge', () => {
    const s = state(doc(paragraph([text('aabb')])), range(0, 2))
    const withRed = applyMark(s, red)
    const rest = { ...withRed, selection: range(2, 4) }
    const withBlue = applyMark(rest, blue)
    expect(withBlue.doc.children[0]!.content).toEqual([
      { type: 'text', text: 'aa', marks: [red] },
      { type: 'text', text: 'bb', marks: [blue] },
    ])
    const allRed = applyMark({ ...withBlue, selection: range(0, 4) }, red)
    expect(allRed.doc.children[0]!.content).toEqual([{ type: 'text', text: 'aabb', marks: [red] }])
  })
})
