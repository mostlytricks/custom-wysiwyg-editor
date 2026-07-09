import { describe, expect, it } from 'vitest'
import { callout, codeBlock, divider, doc, heading, listItem, paragraph, quote, table, tableCell, tableRow, text, todo } from '@custom-wysiwyg/core'
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

describe('lists', () => {
  it('groups consecutive items of one kind into a single list', () => {
    const out = serializeHTML(doc(listItem('bullet', [text('one')]), listItem('bullet', [text('two')])))
    expect(out).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>')
  })

  it('splits lists when the kind changes', () => {
    const out = serializeHTML(doc(listItem('bullet', [text('b')]), listItem('ordered', [text('o')])))
    expect(out).toBe('<ul>\n<li>b</li>\n</ul>\n<ol>\n<li>o</li>\n</ol>')
  })

  it('nests child lists inside the li', () => {
    const out = serializeHTML(doc(listItem('bullet', [text('parent')], undefined, [listItem('bullet', [text('kid')])])))
    expect(out).toBe('<ul>\n<li>parent\n<ul>\n<li>kid</li>\n</ul>\n</li>\n</ul>')
  })

  it('keeps alignment styles on list items', () => {
    const out = serializeHTML(doc(listItem('bullet', [text('c')], { align: 'center' })))
    expect(out).toBe('<ul>\n<li style="text-align: center">c</li>\n</ul>')
  })
})

describe('styled text', () => {
  const red = { type: 'color', attrs: { value: '#e03e3e' } } as const
  const mark = { type: 'highlight', attrs: { value: '#fbf3db' } } as const
  const huge = { type: 'fontSize', attrs: { value: 'huge' } } as const

  it('composes color, highlight, and size into one span style', () => {
    const out = serializeHTML(doc(paragraph([text('wow', [red, mark, huge])])))
    expect(out).toBe(
      '<p><span style="color: #e03e3e; background-color: #fbf3db; font-size: 1.5em">wow</span></p>',
    )
  })

  it('keeps emphasis inside the styled span', () => {
    const out = serializeHTML(doc(paragraph([text('b', [{ type: 'bold' }, red])])))
    expect(out).toBe('<p><span style="color: #e03e3e"><strong>b</strong></span></p>')
  })

  it('escapes hostile style values', () => {
    const evil = { type: 'color', attrs: { value: 'red" onmouseover="x' } } as const
    const out = serializeHTML(doc(paragraph([text('t', [evil])])))
    expect(out).not.toContain('onmouseover="x')
    expect(out).toContain('&quot;')
  })
})

describe('phase 2 blocks', () => {
  it('groups todos into a task ul with checkbox inputs', () => {
    const out = serializeHTML(doc(todo(true, [text('done')]), todo(false, [text('open')])))
    expect(out).toBe(
      '<ul class="cwe-todos">\n<li><input type="checkbox" disabled checked> done</li>\n<li><input type="checkbox" disabled> open</li>\n</ul>',
    )
  })

  it('serializes quotes and callouts', () => {
    expect(serializeHTML(doc(quote([text('q')])))).toBe('<blockquote>q</blockquote>')
    expect(serializeHTML(doc(callout([text('c')])))).toBe('<aside class="cwe-callout">💡 c</aside>')
  })

  it('serializes code blocks with escaped content and language class', () => {
    const out = serializeHTML(doc(codeBlock('if (a < b) {}', 'ts')))
    expect(out).toBe('<pre><code class="language-ts">if (a &lt; b) {}</code></pre>')
  })

  it('serializes dividers', () => {
    expect(serializeHTML(doc(divider()))).toBe('<hr>')
  })
})

describe('tables', () => {
  it('serializes thead/th header and tbody with column alignment', () => {
    const out = serializeHTML(
      doc(
        table(
          [
            tableRow([tableCell([text('H')]), tableCell([text('N')])]),
            tableRow([tableCell([text('a')]), tableCell([text('1')])]),
          ],
          { columnAligns: ['left', 'right'] },
        ),
      ),
    )
    expect(out).toBe(
      '<table>\n<thead>\n<tr><th>H</th><th style="text-align: right">N</th></tr>\n</thead>\n<tbody>\n<tr><td>a</td><td style="text-align: right">1</td></tr>\n</tbody>\n</table>',
    )
  })
})
