// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { doc, Editor, getMark, paragraph, text, type Mark } from '@custom-wysiwyg/core'
import { BubbleMenu } from '@custom-wysiwyg/ui'

function setup(docNode = doc(paragraph([text('site')]))) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  // No autofocus: happy-dom's DOM-selection round-trip collapses a
  // just-set model selection while the editor is focused; unfocused it sticks.
  const editor = new Editor(host, { doc: docNode })
  const menu = new BubbleMenu(editor)
  // Select the word so the bubble menu applies to a range, not the caret.
  editor.commands.setSelection({ anchor: { path: [0], offset: 0 }, head: { path: [0], offset: 4 } })
  return { editor, menu }
}

const linkBtn = (menu: BubbleMenu) => menu.dom.querySelector<HTMLButtonElement>('button[title="Link"]')!
const linkInput = (menu: BubbleMenu) => menu.dom.querySelector<HTMLInputElement>('.cwe-link-input')!
const marksOf = (editor: Editor): Mark[] => editor.getDoc().children[0]!.content[0]!.marks

describe('BubbleMenu inline link editor', () => {
  it('opens an inline input instead of window.prompt', () => {
    const { menu } = setup()
    const editorRow = menu.dom.querySelector<HTMLElement>('.cwe-link-editor')!
    expect(editorRow.style.display).toBe('none')
    linkBtn(menu).click()
    expect(editorRow.style.display).toBe('flex')
  })

  it('applies the typed URL as a link mark', () => {
    const { editor, menu } = setup()
    linkBtn(menu).click()
    linkInput(menu).value = 'https://example.com'
    menu.dom.querySelector<HTMLButtonElement>('.cwe-link-apply')!.click()
    expect(getMark(marksOf(editor), 'link')?.attrs.href).toBe('https://example.com')
  })

  it('prefills the current href and can edit it in place', () => {
    const linked = doc(paragraph([text('site', [{ type: 'link', attrs: { href: 'https://old.com' } }])]))
    const { editor, menu } = setup(linked)
    linkBtn(menu).click()
    expect(linkInput(menu).value).toBe('https://old.com')
    linkInput(menu).value = 'https://new.com'
    menu.dom.querySelector<HTMLButtonElement>('.cwe-link-apply')!.click()
    expect(getMark(marksOf(editor), 'link')?.attrs.href).toBe('https://new.com')
  })

  it('removes the link when Remove is clicked', () => {
    const linked = doc(paragraph([text('site', [{ type: 'link', attrs: { href: 'https://old.com' } }])]))
    const { editor, menu } = setup(linked)
    linkBtn(menu).click()
    menu.dom.querySelector<HTMLButtonElement>('.cwe-link-remove')!.click()
    expect(getMark(marksOf(editor), 'link')).toBeUndefined()
  })

  it('removes the link when applied with an empty value', () => {
    const linked = doc(paragraph([text('site', [{ type: 'link', attrs: { href: 'https://old.com' } }])]))
    const { editor, menu } = setup(linked)
    linkBtn(menu).click()
    linkInput(menu).value = ''
    menu.dom.querySelector<HTMLButtonElement>('.cwe-link-apply')!.click()
    expect(getMark(marksOf(editor), 'link')).toBeUndefined()
  })
})
