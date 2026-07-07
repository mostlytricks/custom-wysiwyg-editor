import { describe, expect, it } from 'vitest'
import { doc, heading, paragraph, text } from '@custom-wysiwyg/core'
import { serializeMarkdown } from '@custom-wysiwyg/export-markdown'

describe('serializeMarkdown', () => {
  it('serializes headings and paragraphs', () => {
    const out = serializeMarkdown(doc(heading(2, [text('Title')]), paragraph([text('Body')])))
    expect(out).toBe('## Title\n\nBody')
  })

  it('serializes bold, italic, and combined marks', () => {
    const out = serializeMarkdown(
      doc(
        paragraph([
          text('a ', []),
          text('bold', [{ type: 'bold' }]),
          text(' and ', []),
          text('both', [{ type: 'bold' }, { type: 'italic' }]),
        ]),
      ),
    )
    expect(out).toBe('a **bold** and ***both***')
  })

  it('keeps emphasis delimiters tight around trailing whitespace', () => {
    const out = serializeMarkdown(doc(paragraph([text('bold ', [{ type: 'bold' }]), text('rest')])))
    expect(out).toBe('**bold** rest')
  })

  it('serializes inline code, growing the fence past inner backticks', () => {
    const out = serializeMarkdown(doc(paragraph([text('a `tick`', [{ type: 'code' }])])))
    expect(out).toBe('`` a `tick` ``')
  })

  it('serializes links', () => {
    const out = serializeMarkdown(doc(paragraph([text('here', [{ type: 'link', attrs: { href: 'https://x.y' } }])])))
    expect(out).toBe('[here](https://x.y)')
  })

  it('escapes markdown control characters in plain text', () => {
    const out = serializeMarkdown(doc(paragraph([text('not *bold* or [link]')])))
    expect(out).toBe('not \\*bold\\* or \\[link\\]')
  })

  it('escapes block starters at the beginning of a paragraph', () => {
    expect(serializeMarkdown(doc(paragraph([text('# not a heading')])))).toBe('\\# not a heading')
    expect(serializeMarkdown(doc(paragraph([text('1. not a list')])))).toBe('1\\. not a list')
  })

  it('falls back to HTML for aligned blocks by default', () => {
    const out = serializeMarkdown(doc(paragraph([text('centered')], { align: 'center' })))
    expect(out).toBe('<p style="text-align: center">centered</p>')
  })

  it('drops alignment when alignedBlocks is plain', () => {
    const out = serializeMarkdown(doc(paragraph([text('centered')], { align: 'center' })), {
      alignedBlocks: 'plain',
    })
    expect(out).toBe('centered')
  })
})
