// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { blockText, doc, Editor, paragraph, text } from '@custom-wysiwyg/core'
import { serializeMarkdown } from '@custom-wysiwyg/export-markdown'
import { connectAgent } from '@custom-wysiwyg/agent-adapter'

function mount(docNode = doc(paragraph([text('hello')]))) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return new Editor(host, { doc: docNode })
}

describe('AgentSession', () => {
  it('provides markdown context and selected text', () => {
    const editor = mount(doc(paragraph([text('hello world')])))
    editor.commands.setSelection({ anchor: { path: [0], offset: 0 }, head: { path: [0], offset: 5 } })
    const context = connectAgent(editor).getContext()
    expect(context.markdown).toBe('hello world')
    expect(context.selectedText).toBe('hello')
    expect(context.doc).toBe(editor.getDoc())
  })

  it('applyMarkdown(append) lands at the end and is undoable', () => {
    const editor = mount()
    const agent = connectAgent(editor)
    expect(agent.applyMarkdown('## Agent note\n\n- [x] reviewed', 'append')).toBe(true)
    expect(serializeMarkdown(editor.getDoc())).toBe('hello\n\n## Agent note\n\n- [x] reviewed')
    expect(editor.undo()).toBe(true)
    expect(serializeMarkdown(editor.getDoc())).toBe('hello')
  })

  it('applyMarkdown(replaceDocument) swaps the doc in one undoable step', () => {
    const editor = mount()
    const agent = connectAgent(editor)
    agent.applyMarkdown('# Rewritten', 'replaceDocument')
    expect(serializeMarkdown(editor.getDoc())).toBe('# Rewritten')
    editor.undo()
    expect(serializeMarkdown(editor.getDoc())).toBe('hello')
  })

  it('applyMarkdown(insert) replaces the current selection', () => {
    const editor = mount(doc(paragraph([text('keep CUT keep')])))
    editor.commands.setSelection({ anchor: { path: [0], offset: 5 }, head: { path: [0], offset: 8 } })
    connectAgent(editor).applyMarkdown('PASTED')
    expect(blockText(editor.getDoc().children[0]!)).toBe('keep PASTED keep')
  })

  it('rejects empty payloads', () => {
    const editor = mount()
    expect(connectAgent(editor).applyMarkdown('', 'append')).toBe(false)
  })

  it('onContext debounces change bursts into one notification', () => {
    vi.useFakeTimers()
    const editor = mount()
    const agent = connectAgent(editor, { contextDebounceMs: 100 })
    const seen: string[] = []
    const off = agent.onContext((context) => seen.push(context.markdown))
    editor.commands.insertText('a')
    editor.commands.insertText('b')
    editor.commands.insertText('c')
    expect(seen).toHaveLength(0)
    vi.advanceTimersByTime(150)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('abc')
    off()
    editor.commands.insertText('d')
    vi.advanceTimersByTime(150)
    expect(seen).toHaveLength(1)
    vi.useRealTimers()
  })

  it('stream writer flushes only complete blocks, end() flushes the tail', () => {
    const editor = mount()
    const writer = connectAgent(editor).createStreamWriter('append')
    writer.write('## Str')
    expect(serializeMarkdown(editor.getDoc())).toBe('hello') // incomplete: nothing applied
    writer.write('eamed\n\npart')
    expect(serializeMarkdown(editor.getDoc())).toBe('hello\n\n## Streamed') // first block flushed
    writer.write('ial text')
    writer.end()
    expect(serializeMarkdown(editor.getDoc())).toBe('hello\n\n## Streamed\n\npartial text')
  })

  it('streamed flushes coalesce in document order', () => {
    const editor = mount()
    const writer = connectAgent(editor).createStreamWriter('append')
    writer.write('- one\n\n')
    writer.write('- two\n\n')
    writer.end()
    expect(serializeMarkdown(editor.getDoc())).toBe('hello\n\n- one\n- two')
  })
})
