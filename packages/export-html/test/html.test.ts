import { describe, expect, it } from 'vitest'
import { doc, heading, paragraph, text } from '@custom-wysiwyg/core'
import { serializeHTML } from '@custom-wysiwyg/export-html'

describe('serializeHTML', () => {
  it('serializes paragraphs and headings', () => {
    const out = serializeHTML(doc(heading(2, [text('Title')]), paragraph([text('Body')])))
    expect(out).toBe('<h2>Title</h2>\n<p>Body</p>')
  })

  it('nests marks deterministically', () => {
    const out = serializeHTML(doc(paragraph([text('x', [{ type: 'bold' }, { type: 'italic' }])])))
    expect(out).toBe('<p><strong><em>x</em></strong></p>')
  })

  it('serializes links with escaped hrefs', () => {
    const out = serializeHTML(
      doc(paragraph([text('here', [{ type: 'link', attrs: { href: 'https://a.b?x=1&y="2"' } }])])),
    )
    expect(out).toBe('<p><a href="https://a.b?x=1&amp;y=&quot;2&quot;">here</a></p>')
  })

  it('escapes HTML in text content', () => {
    const out = serializeHTML(doc(paragraph([text('<script>&')])))
    expect(out).toBe('<p>&lt;script&gt;&amp;</p>')
  })

  it('emits text-align styles for aligned blocks', () => {
    const out = serializeHTML(doc(paragraph([text('centered')], { align: 'center' })))
    expect(out).toBe('<p style="text-align: center">centered</p>')
  })

  it('renders an empty paragraph as an empty tag', () => {
    expect(serializeHTML(doc(paragraph()))).toBe('<p></p>')
  })
})
