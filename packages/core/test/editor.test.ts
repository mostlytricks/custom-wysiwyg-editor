// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { blockText, doc, Editor, heading, paragraph, text } from '@custom-wysiwyg/core'

function mount(docNode = doc()) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor(host, { doc: docNode })
  return { host, editor }
}

/** Types one character through the same beforeinput path a real keystroke takes. */
function typeChar(editor: Editor, data: string): void {
  editor.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data, cancelable: true, bubbles: true }))
}

describe('Editor view', () => {
  it('renders the document with marks and block tags', () => {
    const { host } = mount(doc(heading(1, [text('Title')]), paragraph([text('bold', [{ type: 'bold' }])])))
    expect(host.querySelector('h1')?.textContent).toBe('Title')
    expect(host.querySelector('p strong')?.textContent).toBe('bold')
  })

  it('renders an empty block with a br placeholder', () => {
    const { host } = mount()
    expect(host.querySelector('p br')).not.toBeNull()
  })

  it('renders alignment as an inline style', () => {
    const { host } = mount(doc(paragraph([text('hi')], { align: 'center' })))
    expect(host.querySelector('p')?.style.textAlign).toBe('center')
  })

  it('updates the DOM when commands run', () => {
    const { host, editor } = mount()
    editor.commands.insertText('Hello')
    expect(host.querySelector('p')?.textContent).toBe('Hello')
  })

  it('fires onChange on document changes', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    let calls = 0
    const editor = new Editor(host, { onChange: () => calls++ })
    editor.commands.insertText('a')
    expect(calls).toBe(1)
  })

  it('undoes and redoes document changes', () => {
    const { host, editor } = mount()
    editor.commands.insertText('Hello')
    expect(editor.undo()).toBe(true)
    expect(host.querySelector('p')?.textContent ?? '').toBe('')
    expect(editor.redo()).toBe(true)
    expect(host.querySelector('p')?.textContent).toBe('Hello')
  })

  it('undo after an autoformat restores the literal markdown syntax', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = new Editor(host, { autofocus: true })
    for (const ch of '**b**') typeChar(editor, ch)
    // The autoformat fired: a single bold "b".
    expect(editor.getDoc().children[0]!.content).toEqual([{ type: 'text', text: 'b', marks: [{ type: 'bold' }] }])
    // One undo steps back to the typed syntax rather than straight to empty.
    expect(editor.undo()).toBe(true)
    expect(blockText(editor.getDoc().children[0]!)).toBe('**b**')
  })

  it('removes its DOM on destroy', () => {
    const { host, editor } = mount()
    expect(host.querySelector('.cwe-content')).not.toBeNull()
    editor.destroy()
    expect(host.querySelector('.cwe-content')).toBeNull()
  })
})
