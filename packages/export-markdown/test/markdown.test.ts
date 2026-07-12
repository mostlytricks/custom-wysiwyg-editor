import { describe, expect, it } from 'vitest'
import { callout, codeBlock, divider, doc, heading, listItem, paragraph, quote, table, tableCell, tableRow, text, todo } from '@custom-wysiwyg/core'
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

describe('lists', () => {
  it('serializes bullet lists as a tight list', () => {
    const out = serializeMarkdown(doc(listItem('bullet', [text('one')]), listItem('bullet', [text('two')])))
    expect(out).toBe('- one\n- two')
  })

  it('numbers consecutive ordered items and resets after a break', () => {
    const out = serializeMarkdown(
      doc(
        listItem('ordered', [text('a')]),
        listItem('ordered', [text('b')]),
        paragraph([text('gap')]),
        listItem('ordered', [text('c')]),
      ),
    )
    expect(out).toBe('1. a\n2. b\n\ngap\n\n1. c')
  })

  it('indents nested items to the parent content column', () => {
    const out = serializeMarkdown(
      doc(
        listItem('bullet', [text('parent')], undefined, [listItem('bullet', [text('kid')])]),
        listItem('ordered', [text('num')], undefined, [listItem('ordered', [text('sub')])]),
      ),
    )
    expect(out).toBe('- parent\n  - kid\n1. num\n   1. sub')
  })

  it('separates lists from surrounding blocks with blank lines', () => {
    const out = serializeMarkdown(doc(paragraph([text('before')]), listItem('bullet', [text('item')])))
    expect(out).toBe('before\n\n- item')
  })
})

describe('styled text', () => {
  const red = { type: 'color', attrs: { value: '#e03e3e' } } as const

  it('falls back to an inline span by default', () => {
    const out = serializeMarkdown(doc(paragraph([text('hot', [red, { type: 'bold' }])])))
    expect(out).toBe('<span style="color: #e03e3e">**hot**</span>')
  })

  it('drops styling with styledText: plain', () => {
    const out = serializeMarkdown(doc(paragraph([text('hot', [red, { type: 'bold' }])])), { styledText: 'plain' })
    expect(out).toBe('**hot**')
  })

  it('font family follows the same fallback: span by default, dropped when plain', () => {
    const mono = { type: 'fontFamily', attrs: { value: 'mono' } } as const
    const styled = doc(paragraph([text('code-ish', [mono])]))
    expect(serializeMarkdown(styled)).toBe(
      '<span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace">code-ish</span>',
    )
    expect(serializeMarkdown(styled, { styledText: 'plain' })).toBe('code-ish')
  })
})

describe('phase 2 blocks', () => {
  it('serializes todos as GFM task list items', () => {
    const out = serializeMarkdown(doc(todo(false, [text('open')]), todo(true, [text('done')])))
    expect(out).toBe('- [ ] open\n- [x] done')
  })

  it('serializes quotes with > prefixes, including children', () => {
    const out = serializeMarkdown(doc(quote([text('top')], undefined, [paragraph([text('nested')])])))
    expect(out).toBe('> top\n>\n> nested')
  })

  it('serializes callouts as emoji quotes', () => {
    const out = serializeMarkdown(doc(callout([text('note')], { emoji: '⚠️' })))
    expect(out).toBe('> ⚠️ note')
  })

  it('serializes code blocks as fences with language', () => {
    const out = serializeMarkdown(doc(codeBlock('const x = 1\nx++', 'js')))
    expect(out).toBe('```js\nconst x = 1\nx++\n```')
  })

  it('grows the fence past inner backtick runs', () => {
    const out = serializeMarkdown(doc(codeBlock('```')))
    expect(out).toBe('````\n```\n````')
  })

  it('serializes dividers', () => {
    const out = serializeMarkdown(doc(paragraph([text('a')]), divider(), paragraph([text('b')])))
    expect(out).toBe('a\n\n---\n\nb')
  })
})

describe('tables', () => {
  const t = () =>
    table(
      [
        tableRow([tableCell([text('Name')]), tableCell([text('Qty')])]),
        tableRow([tableCell([text('Apples')]), tableCell([text('3')])]),
        tableRow([tableCell([text('Pears | ok')]), tableCell([text('5')])]),
      ],
      { columnAligns: ['left', 'center'] },
    )

  it('serializes GFM tables with alignment markers and pipe escaping', () => {
    const out = serializeMarkdown(doc(t()))
    expect(out).toBe(
      '| Name | Qty |\n| --- | :-: |\n| Apples | 3 |\n| Pears \\| ok | 5 |',
    )
  })

  it('right alignment uses --:', () => {
    const out = serializeMarkdown(
      doc(table([tableRow([tableCell([text('x')])]), tableRow([tableCell([text('1')])])], { columnAligns: ['right'] })),
    )
    expect(out).toBe('| x |\n| --: |\n| 1 |')
  })
})
