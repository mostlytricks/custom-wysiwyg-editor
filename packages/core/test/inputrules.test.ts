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
    const midState = { ...base, selection: { anchor: { path: [0], offset: 1 }, head: { path: [0], offset: 1 } } }
    const mid = type(midState, ' # ')
    expect(mid.doc.children[0]!.type).toBe('paragraph')
    const inHeading = type(createEditorState(doc(heading(2))), '# ')
    expect(inHeading.doc.children[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
  })

  it('autoformats **bold**', () => {
    const next = type(createEditorState(), 'say **loud** ok')
    expect(next.doc.children[0]!.content).toEqual([
      { type: 'text', text: 'say ', marks: [] },
      { type: 'text', text: 'loud', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ok', marks: [] },
    ])
  })

  it('autoformats *italic* without eating bold syntax', () => {
    const next = type(createEditorState(), '*it*')
    expect(next.doc.children[0]!.content).toEqual([{ type: 'text', text: 'it', marks: [{ type: 'italic' }] }])
  })

  it('autoformats `code`', () => {
    const next = type(createEditorState(), 'run `x` now')
    expect(next.doc.children[0]!.content).toEqual([
      { type: 'text', text: 'run ', marks: [] },
      { type: 'text', text: 'x', marks: [{ type: 'code' }] },
      { type: 'text', text: ' now', marks: [] },
    ])
  })

  it('clears stored marks so typing after an autoformat is plain', () => {
    const next = type(createEditorState(), '**b**')
    expect(next.storedMarks).toEqual([])
    const typed = insertText(next, 'x')
    expect(typed.doc.children[0]!.content).toEqual([
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'x', marks: [] },
    ])
  })
})

describe('list input rules', () => {
  it('converts "- " into a bullet list item', () => {
    const next = type(createEditorState(), '- point')
    expect(next.doc.children[0]).toMatchObject({ type: 'listItem', attrs: { kind: 'bullet' } })
    expect(blockText(next.doc.children[0]!)).toBe('point')
  })

  it('converts "* " into a bullet list item', () => {
    const next = type(createEditorState(), '* point')
    expect(next.doc.children[0]).toMatchObject({ type: 'listItem', attrs: { kind: 'bullet' } })
  })

  it('converts "1. " into an ordered list item', () => {
    const next = type(createEditorState(), '1. first')
    expect(next.doc.children[0]).toMatchObject({ type: 'listItem', attrs: { kind: 'ordered' } })
    expect(blockText(next.doc.children[0]!)).toBe('first')
  })

  it('does not fire inside a heading or mid-text', () => {
    const inHeading = type(createEditorState(doc(heading(2))), '- ')
    expect(inHeading.doc.children[0]!.type).toBe('heading')
    const mid = type(createEditorState(doc(paragraph([text('a')])), ), 'x')
    expect(mid.doc.children[0]!.type).toBe('paragraph')
  })
})

describe('block input rules (phase 2 batch)', () => {
  it('converts "[] " and "[x] " into todos', () => {
    const unchecked = type(createEditorState(), '[] task')
    expect(unchecked.doc.children[0]).toMatchObject({ type: 'todo', attrs: { checked: false } })
    expect(blockText(unchecked.doc.children[0]!)).toBe('task')
    const checked = type(createEditorState(), '[x] done')
    expect(checked.doc.children[0]).toMatchObject({ type: 'todo', attrs: { checked: true } })
  })

  it('converts "> " into a quote', () => {
    const next = type(createEditorState(), '> wisdom')
    expect(next.doc.children[0]).toMatchObject({ type: 'quote' })
    expect(blockText(next.doc.children[0]!)).toBe('wisdom')
  })

  it('converts "``` " into a code block and disables rules inside', () => {
    const next = type(createEditorState(), '``` ')
    expect(next.doc.children[0]).toMatchObject({ type: 'codeBlock' })
    const typed = type(next, '# not a heading ')
    expect(typed.doc.children[0]).toMatchObject({ type: 'codeBlock' })
    expect(blockText(typed.doc.children[0]!)).toBe('# not a heading ')
  })

  it('converts "--- " into a divider with a fresh paragraph after', () => {
    const next = type(createEditorState(), '--- ')
    expect(next.doc.children.map((b) => b.type)).toEqual(['divider', 'paragraph'])
    expect(next.selection.head).toEqual({ path: [1], offset: 0 })
  })
})
