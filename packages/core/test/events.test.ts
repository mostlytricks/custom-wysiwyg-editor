// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { doc, Editor, paragraph, text } from '@custom-wysiwyg/core'

function mount(docNode = doc()) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return new Editor(host, { doc: docNode })
}

describe('Editor events', () => {
  it('emits change and update on document changes', () => {
    const editor = mount()
    const events: string[] = []
    editor.on('change', () => events.push('change'))
    editor.on('update', () => events.push('update'))
    editor.commands.insertText('a')
    expect(events).toEqual(['change', 'update'])
  })

  it('emits update (not change) on selection-only changes', () => {
    const editor = mount(doc(paragraph([text('hello')])))
    const events: string[] = []
    editor.on('change', () => events.push('change'))
    editor.on('update', () => events.push('update'))
    editor.commands.setSelection({ anchor: { block: 0, offset: 1 }, head: { block: 0, offset: 3 } })
    expect(events).toEqual(['update'])
  })

  it('unsubscribes', () => {
    const editor = mount()
    let calls = 0
    const off = editor.on('change', () => calls++)
    editor.commands.insertText('a')
    off()
    editor.commands.insertText('b')
    expect(calls).toBe(1)
  })

  it('exposes mark state for toolbars', () => {
    const editor = mount(doc(paragraph([text('hi', [{ type: 'bold' }])])))
    editor.commands.setSelection({ anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 2 } })
    expect(editor.isMarkActive('bold')).toBe(true)
    expect(editor.isMarkActive('italic')).toBe(false)
  })

  it('sets placeholder attributes only while empty', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = new Editor(host, { placeholder: 'Type…' })
    expect(editor.dom.getAttribute('data-placeholder')).toBe('Type…')
    expect(editor.dom.getAttribute('data-empty')).toBe('true')
    editor.commands.insertText('a')
    expect(editor.dom.getAttribute('data-empty')).toBeNull()
  })
})
