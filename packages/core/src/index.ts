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
  clampPath,
  clampPosition,
  collapsedSelection,
  comparePositions,
  orderedRange,
  positionsEqual,
  selectionIsCollapsed,
  selectionsEqual,
} from './model/position'

export type { BlockPath } from './model/path'
export {
  blockAt,
  blockEntries,
  blocksInRange,
  comparePaths,
  firstPath,
  insertBlockAfter,
  isAncestorOrSelf,
  lastPath,
  nextPath,
  parentPath,
  pathsEqual,
  previousPath,
  removeBlockAt,
  replaceBlockAt,
  siblingAfter,
  spliceBlocksAt,
} from './model/path'

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
  deleteRange,
  deleteRangeInDoc,
  insertLines,
  insertText,
  insertTextInDoc,
  isMarkActive,
  selectAll,
  setAlign,
  setHeading,
  setParagraph,
  setSelection,
  splitBlock,
  toggleMark,
} from './commands'

export { runInputRules } from './inputrules'

export { attrToPath, pathToAttr, renderBlock, renderSpan } from './view/render'
export { applyDOMSelection, domPointToPosition, positionToDOMPoint, readDOMSelection } from './view/selection'

export type { EditorEventType, EditorOptions } from './editor'
export { Editor } from './editor'
