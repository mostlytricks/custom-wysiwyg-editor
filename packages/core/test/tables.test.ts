import { describe, expect, it } from 'vitest'
import {
  addTableColumn,
  addTableRow,
  blockAt,
  blockText,
  cellContext,
  createEditorState,
  deleteBackward,
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  doc,
  emptyTable,
  insertTable,
  insertText,
  paragraph,
  setAlign,
  setHeading,
  splitBlock,
  table,
  tableCell,
  tableRow,
  text,
  type EditorState,
  type SelectionRange,
  type TableNode,
} from '@custom-wysiwyg/core'

function state(docNode = doc(), selection?: Partial<SelectionRange>): EditorState {
  const base = createEditorState(docNode)
  return selection ? { ...base, selection: { ...base.selection, ...selection } } : base
}

const caret = (path: number[], offset: number): SelectionRange => ({
  anchor: { path, offset },
  head: { path, offset },
})

function sampleTable(): TableNode {
  return table([
    tableRow([tableCell([text('h1')]), tableCell([text('h2')])]),
    tableRow([tableCell([text('a')]), tableCell([text('b')])]),
  ])
}

describe('table structure', () => {
  it('insertTable replaces an empty paragraph and puts the caret in the first cell', () => {
    const next = insertTable(state(doc(paragraph()), caret([0], 0)), 3, 3)
    const t = next.doc.children[0]!
    expect(t.type).toBe('table')
    expect(t.children).toHaveLength(3)
    expect(t.children![0]!.children).toHaveLength(3)
    expect(next.selection.head).toEqual({ path: [0, 0, 0], offset: 0 })
  })

  it('cellContext resolves the enclosing cell', () => {
    const d = doc(paragraph(), sampleTable())
    expect(cellContext(d, [1, 1, 0])).toMatchObject({ tablePath: [1], rowIndex: 1, colIndex: 0 })
    expect(cellContext(d, [0])).toBeNull()
  })

  it('typing lands in a cell', () => {
    const s = state(doc(sampleTable()), caret([0, 1, 0], 1))
    const next = insertText(s, 'x')
    expect(blockText(blockAt(next.doc, [0, 1, 0])!)).toBe('ax')
  })

  it('addTableRow / addTableColumn grow the grid', () => {
    const s = state(doc(sampleTable()), caret([0, 0, 1], 0))
    const withRow = addTableRow(s)!
    expect(blockAt(withRow.doc, [0])!.children).toHaveLength(3)
    expect(withRow.selection.head.path).toEqual([0, 1, 1])
    const withCol = addTableColumn(s)!
    expect(blockAt(withCol.doc, [0, 0])!.children).toHaveLength(3)
    expect(blockAt(withCol.doc, [0, 1])!.children).toHaveLength(3)
  })

  it('deleteTableRow / deleteTableColumn shrink; the last one deletes the table', () => {
    const s = state(doc(sampleTable()), caret([0, 1, 0], 0))
    const oneRow = deleteTableRow(s)!
    expect(blockAt(oneRow.doc, [0])!.children).toHaveLength(1)
    const oneCol = deleteTableColumn(s)!
    expect(blockAt(oneCol.doc, [0, 0])!.children).toHaveLength(1)
    const noTable = deleteTable(s)!
    expect(noTable.doc.children[0]!.type).toBe('paragraph')
  })
})

describe('cell walls', () => {
  it('cross-cell ranges do not merge cells', () => {
    const s = state(doc(sampleTable()), {
      anchor: { path: [0, 1, 0], offset: 0 },
      head: { path: [0, 1, 1], offset: 1 },
    })
    expect(insertText(s, 'x')).toBe(s)
    expect(deleteBackward(s)).toBeNull()
  })

  it('Backspace at cell start is a no-op', () => {
    const s = state(doc(sampleTable()), caret([0, 1, 1], 0))
    expect(deleteBackward(s)).toBeNull()
  })

  it('Backspace in the block after a table never merges into it', () => {
    const s = state(doc(sampleTable(), paragraph([text('after')])), caret([1], 0))
    expect(deleteBackward(s)).toBeNull()
  })

  it('Enter never splits a cell', () => {
    const s = state(doc(sampleTable()), caret([0, 1, 0], 1))
    expect(splitBlock(s)).toBe(s)
  })

  it('conversions skip table structure', () => {
    const s = state(doc(sampleTable()), {
      anchor: { path: [0, 0, 0], offset: 0 },
      head: { path: [0, 1, 1], offset: 1 },
    })
    const next = setHeading(s, 1)
    expect(blockAt(next.doc, [0])!.type).toBe('table')
    expect(blockAt(next.doc, [0, 0, 0])!.type).toBe('tableCell')
  })
})

describe('column alignment', () => {
  it('setAlign in a cell aligns the column on table attrs', () => {
    const s = state(doc(sampleTable()), caret([0, 1, 1], 0))
    const next = setAlign(s, 'center')
    const t = blockAt(next.doc, [0])!
    expect(t.type === 'table' && t.attrs?.columnAligns).toEqual(['left', 'center'])
  })
})
