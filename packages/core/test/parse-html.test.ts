// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { doc, listItem, paragraph, parseHTML, text } from '@custom-wysiwyg/core'

describe('parseHTML', () => {
  it('parses paragraphs and headings with marks', () => {
    const blocks = parseHTML('<h2>Title</h2><p>plain <strong>bold <em>both</em></strong></p>')
    expect(blocks[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect(blocks[1]!.content).toEqual([
      { type: 'text', text: 'plain ', marks: [] },
      { type: 'text', text: 'bold ', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'both', marks: [{ type: 'bold' }, { type: 'italic' }] },
    ])
  })

  it('parses links and styled spans back to marks', () => {
    const blocks = parseHTML(
      '<p><a href="https://x.y">go</a> <span style="color: #e03e3e; font-size: 1.5em">hot</span></p>',
    )
    expect(blocks[0]!.content[0]!.marks).toEqual([{ type: 'link', attrs: { href: 'https://x.y' } }])
    const styled = blocks[0]!.content.at(-1)!
    expect(styled.marks).toEqual([
      { type: 'color', attrs: { value: '#e03e3e' } },
      { type: 'fontSize', attrs: { value: 'huge' } },
    ])
  })

  it('maps font-family stacks back to tokens (exact stack or keyword sniff)', () => {
    const blocks = parseHTML(
      '<p><span style="font-family: Georgia, \'Times New Roman\', serif">a</span>' +
        '<span style="font-family: Consolas, monospace">b</span>' +
        '<span style="font-family: Helvetica, sans-serif">c</span></p>',
    )
    expect(blocks[0]!.content).toEqual([
      { type: 'text', text: 'a', marks: [{ type: 'fontFamily', attrs: { value: 'serif' } }] },
      { type: 'text', text: 'b', marks: [{ type: 'fontFamily', attrs: { value: 'mono' } }] },
      // sans-serif is the default look, not our serif token.
      { type: 'text', text: 'c', marks: [] },
    ])
  })

  it('parses nested lists and todos', () => {
    const blocks = parseHTML(
      '<ul><li>parent<ul><li>kid</li></ul></li></ul><ul class="cwe-todos"><li><input type="checkbox" checked> done</li></ul>',
    )
    expect(blocks[0]).toMatchObject({ type: 'listItem', attrs: { kind: 'bullet' } })
    expect(blocks[0]!.children![0]).toMatchObject({ type: 'listItem' })
    expect(blocks[1]).toMatchObject({ type: 'todo', attrs: { checked: true } })
    expect(blocks[1]!.content[0]!.text).toBe('done')
  })

  it('parses quotes, code, dividers, and callouts', () => {
    const blocks = parseHTML(
      '<blockquote>wisdom</blockquote><pre><code class="language-ts">let x = 1\nx++</code></pre><hr><aside class="cwe-callout">💡 note</aside>',
    )
    expect(blocks[0]).toMatchObject({ type: 'quote' })
    expect(blocks[1]).toMatchObject({ type: 'codeBlock', attrs: { language: 'ts' } })
    expect(blocks[1]!.content[0]!.text).toBe('let x = 1\nx++')
    expect(blocks[2]).toMatchObject({ type: 'divider' })
    expect(blocks[3]).toMatchObject({ type: 'callout', attrs: { emoji: '💡' } })
    expect(blocks[3]!.content[0]!.text).toBe('note')
  })

  it('parses tables with column alignment', () => {
    const blocks = parseHTML(
      '<table><thead><tr><th>H</th><th style="text-align: right">N</th></tr></thead><tbody><tr><td>a</td><td style="text-align: right">1</td></tr></tbody></table>',
    )
    expect(blocks[0]).toMatchObject({ type: 'table', attrs: { columnAligns: ['left', 'right'] } })
    expect(blocks[0]!.children).toHaveLength(2)
    expect(blocks[0]!.children![1]!.children![1]!.content[0]!.text).toBe('1')
  })

  it('flattens unknown containers and lifts loose inline runs into paragraphs', () => {
    const blocks = parseHTML('<div><p>real</p>loose <b>text</b></div>')
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph'])
    expect(blocks[1]!.content.map((s) => s.text).join('')).toBe('loose text')
  })

  it('round-trips its own HTML export', async () => {
    const { serializeHTML } = await import('@custom-wysiwyg/export-html')
    const original = doc(
      paragraph([text('plain '), text('bold', [{ type: 'bold' }])]),
      listItem('bullet', [text('one')]),
      listItem('bullet', [text('two')]),
    )
    const parsed = parseHTML(serializeHTML(original))
    expect(parsed).toEqual(original.children)
  })
})
