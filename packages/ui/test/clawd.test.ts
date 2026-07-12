// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, Editor, paragraph, text } from '@custom-wysiwyg/core'
import { Clawd } from '@custom-wysiwyg/ui'

function setup() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor(host, { doc: doc(paragraph([text('hi')])) })
  const clawd = new Clawd(editor)
  return { editor, clawd }
}

describe('Clawd', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('mounts a decorative, pointer-transparent buddy', () => {
    const { clawd } = setup()
    expect(clawd.dom.getAttribute('aria-hidden')).toBe('true')
    expect(clawd.dom.querySelector('.cwe-clawd-buddy')!.textContent).toBe('🐉')
    expect(clawd.jazzing).toBe(false)
  })

  it('jazzes on document changes and winds down after the cooldown', () => {
    const { editor, clawd } = setup()
    editor.commands.insertText('!')
    expect(clawd.jazzing).toBe(true)
    vi.advanceTimersByTime(1100)
    expect(clawd.jazzing).toBe(true) // still within the 1200ms cooldown
    vi.advanceTimersByTime(200)
    expect(clawd.jazzing).toBe(false)
  })

  it('keeps jazzing while typing continues (cooldown resets per change)', () => {
    const { editor, clawd } = setup()
    editor.commands.insertText('a')
    vi.advanceTimersByTime(1000)
    editor.commands.insertText('b')
    vi.advanceTimersByTime(1000)
    expect(clawd.jazzing).toBe(true)
    vi.advanceTimersByTime(300)
    expect(clawd.jazzing).toBe(false)
  })

  it('floats a note that cleans itself up', () => {
    const { editor, clawd } = setup()
    editor.commands.insertText('!')
    expect(clawd.dom.querySelectorAll('.cwe-clawd-note').length).toBe(1)
    vi.advanceTimersByTime(1100)
    expect(clawd.dom.querySelectorAll('.cwe-clawd-note').length).toBe(0)
  })

  it('destroy removes the DOM and stops listening', () => {
    const { editor, clawd } = setup()
    clawd.destroy()
    expect(clawd.dom.isConnected).toBe(false)
    editor.commands.insertText('!') // must not throw or resurrect anything
    expect(clawd.dom.querySelector('.cwe-clawd-note')).toBeNull()
    expect(clawd.jazzing).toBe(false)
  })
})
