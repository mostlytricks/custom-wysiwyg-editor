import { describe, expect, it } from 'vitest'
import {
  callout,
  codeBlock,
  divider,
  doc,
  heading,
  listItem,
  paragraph,
  quote,
  table,
  tableCell,
  tableRow,
  text,
  todo,
} from '@custom-wysiwyg/core'
import { serializeMarkdown } from '@custom-wysiwyg/export-markdown'
import { parseMarkdown } from '@custom-wysiwyg/import-markdown'

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, and inline marks', () => {
    const out = parseMarkdown('## Title\n\nplain **bold** *it* `code` [go](https://x.y)')
    expect(out.children[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect(out.children[1]!.content).toEqual([
      { type: 'text', text: 'plain ', marks: [] },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'it', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'code', marks: [{ type: 'code' }] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'go', marks: [{ type: 'link', attrs: { href: 'https://x.y' } }] },
    ])
  })

  it('unescapes backslash escapes', () => {
    const out = parseMarkdown('not \\*bold\\*')
    expect(out.children[0]!.content).toEqual([{ type: 'text', text: 'not *bold*', marks: [] }])
  })

  it('parses nested lists and todos', () => {
    const out = parseMarkdown('- parent\n  - kid\n- [x] done\n- [ ] open')
    expect(out.children[0]).toMatchObject({ type: 'listItem', attrs: { kind: 'bullet' } })
    expect(out.children[0]!.children![0]!.content[0]!.text).toBe('kid')
    expect(out.children[1]).toMatchObject({ type: 'todo', attrs: { checked: true } })
    expect(out.children[2]).toMatchObject({ type: 'todo', attrs: { checked: false } })
  })

  it('parses quotes and emoji callouts', () => {
    const out = parseMarkdown('> wisdom\n\n> ⚠️ careful')
    expect(out.children[0]).toMatchObject({ type: 'quote' })
    expect(out.children[1]).toMatchObject({ type: 'callout', attrs: { emoji: '⚠️' } })
    expect(out.children[1]!.content[0]!.text).toBe('careful')
  })

  it('parses fenced code and dividers', () => {
    const out = parseMarkdown('```ts\nconst a = 1\na++\n```\n\n---')
    expect(out.children[0]).toMatchObject({ type: 'codeBlock', attrs: { language: 'ts' } })
    expect(out.children[0]!.content[0]!.text).toBe('const a = 1\na++')
    expect(out.children[1]).toMatchObject({ type: 'divider' })
  })

  it('parses GFM tables with alignment and escaped pipes', () => {
    const out = parseMarkdown('| A | B |\n| --- | :-: |\n| x \\| y | 1 |')
    const t = out.children[0]!
    expect(t).toMatchObject({ type: 'table', attrs: { columnAligns: ['left', 'center'] } })
    expect(t.children![1]!.children![0]!.content[0]!.text).toBe('x | y')
  })

  it('joins soft-wrapped lines into one paragraph', () => {
    const out = parseMarkdown('first line\nsecond line')
    expect(out.children).toHaveLength(1)
    expect(out.children[0]!.content[0]!.text).toBe('first line second line')
  })

  it('round-trips the exporter output', () => {
    const original = doc(
      heading(1, [text('Title')]),
      paragraph([text('plain '), text('bold', [{ type: 'bold' }]), text(' and '), text('code', [{ type: 'code' }])]),
      listItem('bullet', [text('one')], undefined, [listItem('bullet', [text('nested')])]),
      listItem('bullet', [text('two')]),
      todo(true, [text('done')]),
      quote([text('quoted')]),
      callout([text('remember')], { emoji: '💡' }),
      codeBlock('let x = 1', 'js'),
      divider(),
      table(
        [
          tableRow([tableCell([text('H')]), tableCell([text('N')])]),
          tableRow([tableCell([text('a')]), tableCell([text('1')])]),
        ],
        { columnAligns: ['left', 'right'] },
      ),
    )
    const roundTripped = parseMarkdown(serializeMarkdown(original))
    expect(roundTripped.children).toEqual(original.children)
  })
})
