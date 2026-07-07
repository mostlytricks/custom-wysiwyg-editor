export type {
  Alignment,
  BlockNode,
  BlockType,
  BoldMark,
  CodeMark,
  DocNode,
  HeadingAttrs,
  HeadingLevel,
  HeadingNode,
  ItalicMark,
  LinkMark,
  Mark,
  MarkType,
  ParagraphAttrs,
  ParagraphNode,
  TextSpan,
} from './model/types'
export { doc, emptyDoc, heading, paragraph, text } from './model/types'

export type { Position, SelectionRange } from './model/position'
export {
  clampPosition,
  collapsedSelection,
  comparePositions,
  orderedRange,
  positionsEqual,
  selectionIsCollapsed,
  selectionsEqual,
} from './model/position'

export {
  blockLength,
  blockText,
  getMark,
  hasMarkType,
  marksAtOffset,
  marksEqual,
  markSetsEqual,
  normalizeSpans,
  sliceSpans,
  spansLength,
} from './model/spans'

export type { EditorState } from './state'
export { createEditorState } from './state'

export {
  deleteBackward,
  deleteForward,
  deleteRangeInDoc,
  insertLines,
  insertText,
  selectAll,
  setAlign,
  setHeading,
  setParagraph,
  splitBlock,
  toggleMark,
} from './commands'

export { renderBlock, renderSpan } from './view/render'
export { applyDOMSelection, domPointToPosition, positionToDOMPoint, readDOMSelection } from './view/selection'

export type { EditorOptions } from './editor'
export { Editor } from './editor'
