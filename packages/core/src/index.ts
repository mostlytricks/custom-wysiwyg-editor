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
  ListItemAttrs,
  ListItemNode,
  ListKind,
  Mark,
  MarkType,
  ParagraphAttrs,
  ParagraphNode,
  TextSpan,
} from './model/types'
export { doc, emptyDoc, heading, listItem, paragraph, text } from './model/types'

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
  indentListItem,
  insertLines,
  insertText,
  insertTextInDoc,
  isMarkActive,
  outdentListItem,
  selectAll,
  setAlign,
  setHeading,
  setList,
  setParagraph,
  setSelection,
  splitBlock,
  toggleList,
  toggleMark,
} from './commands'

export { runInputRules } from './inputrules'

export { attrToPath, pathToAttr, renderBlock, renderBlocks, renderSpan } from './view/render'
export { applyDOMSelection, domPointToPosition, positionToDOMPoint, readDOMSelection } from './view/selection'

export type { EditorEventType, EditorOptions } from './editor'
export { Editor } from './editor'
