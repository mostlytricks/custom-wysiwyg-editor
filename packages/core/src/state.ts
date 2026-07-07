import type { DocNode, Mark } from './model/types'
import { emptyDoc } from './model/types'
import type { SelectionRange } from './model/position'

/**
 * Immutable editor state. Commands take a state and return a new one; the
 * Editor class owns the current state and history.
 */
export interface EditorState {
  doc: DocNode
  selection: SelectionRange
  /**
   * Marks to apply to the next typed character when the selection is
   * collapsed (e.g. after pressing Cmd+B with nothing selected). Cleared
   * whenever the selection moves.
   */
  storedMarks: Mark[] | null
}

export function createEditorState(docNode?: DocNode): EditorState {
  const documentNode = docNode ?? emptyDoc()
  return {
    doc: documentNode,
    selection: { anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 0 } },
    storedMarks: null,
  }
}
