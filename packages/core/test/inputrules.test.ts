import { describe, expect, it } from 'vitest'
import {
  blockText,
  createEditorState,
  doc,
  heading,
  insertText,
  paragraph,
  runInputRules,
  text,
  type EditorState,
} from '@custom-wysiwyg/core'

/** Simulates typing a string character by character, applying input rules like the editor does. */
function type(state: EditorState, content: string): EditorState {
  let current = state
  for (const char of content) {
    const inserted = insertText(current, char)
    current = runInputRules(inserted, char) ?? inserted
  }
  return current
}

describe('input rules', () => {
  it('converts "# " into a heading', () => {
    const next = type(createEditorState(), '# ')
    expect(next.doc.children[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(blockText(next.doc.children[0]!)).toBe('')
  })

  it('converts "### " into an h3 and keeps typing inside it', () => {
    const next = type(createEditorState(), '### Title')
    expect(next.doc.children[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
    expect(blockText(next.doc.children[0]!)).toBe('Title')
  })

  it('does not convert "#### " (only h1–h3 exist)', () => {
    const next = type(createEditorState(), '#### x')
    expect(next.doc.children[0]!.type).toBe('paragraph')
  })

  it('converts when "# " is typed at the start of a non-empty block', () => {
    const next = type(createEditorState(doc(paragraph([text('existing')]))), '# ')
    expect(next.doc.children[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(blockText(next.doc.children[0]!)).toBe('existing')
  })

  it('does not fire the heading rule mid-block or in headings', () => {
    const base = createEditorState(doc(paragraph([text('a')])))
    const midState = { ...base, selection: { anchor: { block: 0, offset: 1 }, head: { block: 0, offset: 1 } } }
    const mid = type(midState, ' # ')
    expect(mid.doc.children[0]!.type).toBe('paragraph')
    const inHeading = type(createEditorState(doc(heading(2))), '# ')
    expect(inHeading.doc.children[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
  })

  it('autoformats **bold**', () => {
    const next = type(createEditorState(), 'say **loud** ok')
    expect(next.doc.children[0]!.children).toEqual([
      { type: 'text', text: 'say ', marks: [] },
      { type: 'text', text: 'loud', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ok', marks: [] },
    ])
  })

  it('autoformats *italic* without eating bold syntax', () => {
    const next = type(createEditorState(), '*it*')
    expect(next.doc.children[0]!.children).toEqual([{ type: 'text', text: 'it', marks: [{ type: 'italic' }] }])
  })

  it('autoformats `code`', () => {
    const next = type(createEditorState(), 'run `x` now')
    expect(next.doc.children[0]!.children).toEqual([
      { type: 'text', text: 'run ', marks: [] },
      { type: 'text', text: 'x', marks: [{ type: 'code' }] },
      { type: 'text', text: ' now', marks: [] },
    ])
  })

  it('clears stored marks so typing after an autoformat is plain', () => {
    const next = type(createEditorState(), '**b**')
    expect(next.storedMarks).toEqual([])
    const typed = insertText(next, 'x')
    expect(typed.doc.children[0]!.children).toEqual([
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'x', marks: [] },
    ])
  })
})
