/**
 * The document model. This JSON tree — not the DOM — is the single source of
 * truth for editor content. The contenteditable layer is only a view over it,
 * and every exporter serializes from it, so output is deterministic across
 * browsers.
 *
 * Blocks form a recursive tree: `content` holds a block's own inline text
 * (runs of marked spans), `children` holds nested blocks (list nesting,
 * toggle bodies, …). Positions address blocks by path — see model/path.ts.
 */

export type Alignment = 'left' | 'center' | 'right' | 'justify'

export interface BoldMark {
  type: 'bold'
}

export interface ItalicMark {
  type: 'italic'
}

export interface CodeMark {
  type: 'code'
}

export interface LinkMark {
  type: 'link'
  attrs: { href: string }
}

/** Text color. `value` is any CSS color; the UI offers a preset palette. */
export interface ColorMark {
  type: 'color'
  attrs: { value: string }
}

/** Background highlight. `value` is any CSS color. */
export interface HighlightMark {
  type: 'highlight'
  attrs: { value: string }
}

/**
 * Font size as a token, not a CSS length — rendering and export own the
 * token→size mapping so the model stays presentation-free.
 */
export type FontSizeToken = 'small' | 'large' | 'huge'

export interface FontSizeMark {
  type: 'fontSize'
  attrs: { value: FontSizeToken }
}

/**
 * Font family as a token, like font size — rendering and export own the
 * token→stack mapping. Default (no mark) inherits the host page's font.
 */
export type FontFamilyToken = 'serif' | 'mono'

export interface FontFamilyMark {
  type: 'fontFamily'
  attrs: { value: FontFamilyToken }
}

export type Mark =
  | BoldMark
  | ItalicMark
  | CodeMark
  | LinkMark
  | ColorMark
  | HighlightMark
  | FontSizeMark
  | FontFamilyMark
export type MarkType = Mark['type']

/** The single place tokens become sizes (used by the view and the HTML exporter). */
export const FONT_SIZES: Record<FontSizeToken, string> = {
  small: '0.85em',
  large: '1.25em',
  huge: '1.5em',
}

/** The single place tokens become font stacks (used by the view and the HTML exporter). */
export const FONT_FAMILIES: Record<FontFamilyToken, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

/** A run of text sharing the same set of marks. */
export interface TextSpan {
  type: 'text'
  text: string
  marks: Mark[]
}

export interface ParagraphAttrs {
  align?: Alignment
}

export type HeadingLevel = 1 | 2 | 3

export interface HeadingAttrs {
  level: HeadingLevel
  align?: Alignment
}

export type ListKind = 'bullet' | 'ordered'

export interface ListItemAttrs {
  kind: ListKind
  align?: Alignment
}

export interface ParagraphNode {
  type: 'paragraph'
  attrs?: ParagraphAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface HeadingNode {
  type: 'heading'
  attrs: HeadingAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

/**
 * One list item, Notion-style: there is no wrapper "list" node — a list is a
 * run of consecutive siblings of the same kind, and nesting is the ordinary
 * block tree (`children`). Exporters group runs into <ul>/<ol> / indented
 * Markdown.
 */
export interface ListItemNode {
  type: 'listItem'
  attrs: ListItemAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface TodoAttrs {
  checked: boolean
  align?: Alignment
}

/** A checkable to-do line. Nesting via `children`, like list items. */
export interface TodoNode {
  type: 'todo'
  attrs: TodoAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface QuoteAttrs {
  align?: Alignment
}

export interface QuoteNode {
  type: 'quote'
  attrs?: QuoteAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface CodeBlockAttrs {
  language?: string
  /** Never rendered — present so shared command code can read attrs.align uniformly. */
  align?: Alignment
}

/**
 * Verbatim text: content carries no marks, newlines live inside the text
 * (Enter inserts '\n' instead of splitting), and input rules are off.
 */
export interface CodeBlockNode {
  type: 'codeBlock'
  attrs?: CodeBlockAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface DividerAttrs {
  /** Never rendered — present so shared command code can read attrs.align uniformly. */
  align?: Alignment
}

/** A void block — no text, no children; just a horizontal rule. */
export interface DividerNode {
  type: 'divider'
  attrs?: DividerAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface CalloutAttrs {
  emoji?: string
  align?: Alignment
}

export interface CalloutNode {
  type: 'callout'
  attrs?: CalloutAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface TableAttrs {
  /** Per-column alignment (GFM model). Sparse; missing entries mean 'left'. */
  columnAligns?: Alignment[]
  /** Never rendered — present so shared command code can read attrs.align uniformly. */
  align?: Alignment
}

/** children = tableRow blocks. Own content is always empty. */
export interface TableNode {
  type: 'table'
  attrs?: TableAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface TableRowAttrs {
  align?: Alignment
}

/** children = tableCell blocks. Own content is always empty. */
export interface TableRowNode {
  type: 'tableRow'
  attrs?: TableRowAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export interface TableCellAttrs {
  align?: Alignment
}

/** A cell holds inline text only (v1: no nested blocks). */
export interface TableCellNode {
  type: 'tableCell'
  attrs?: TableCellAttrs
  content: TextSpan[]
  children?: BlockNode[]
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | ListItemNode
  | TodoNode
  | QuoteNode
  | CodeBlockNode
  | DividerNode
  | CalloutNode
  | TableNode
  | TableRowNode
  | TableCellNode
export type BlockType = BlockNode['type']

export const DEFAULT_CALLOUT_EMOJI = '💡'

export interface DocNode {
  type: 'doc'
  children: BlockNode[]
}

// ---------------------------------------------------------------------------
// Builders — convenience helpers for constructing documents in code and tests.
// ---------------------------------------------------------------------------

export function text(content: string, marks: Mark[] = []): TextSpan {
  return { type: 'text', text: content, marks }
}

export function paragraph(content: TextSpan[] = [], attrs?: ParagraphAttrs, children?: BlockNode[]): ParagraphNode {
  return {
    type: 'paragraph',
    ...(attrs ? { attrs } : {}),
    content,
    ...(children && children.length > 0 ? { children } : {}),
  }
}

export function heading(
  level: HeadingLevel,
  content: TextSpan[] = [],
  attrs?: Omit<HeadingAttrs, 'level'>,
  children?: BlockNode[],
): HeadingNode {
  return {
    type: 'heading',
    attrs: { level, ...attrs },
    content,
    ...(children && children.length > 0 ? { children } : {}),
  }
}

export function listItem(
  kind: ListKind,
  content: TextSpan[] = [],
  attrs?: Omit<ListItemAttrs, 'kind'>,
  children?: BlockNode[],
): ListItemNode {
  return {
    type: 'listItem',
    attrs: { kind, ...attrs },
    content,
    ...(children && children.length > 0 ? { children } : {}),
  }
}

export function todo(
  checked = false,
  content: TextSpan[] = [],
  attrs?: Omit<TodoAttrs, 'checked'>,
  children?: BlockNode[],
): TodoNode {
  return {
    type: 'todo',
    attrs: { checked, ...attrs },
    content,
    ...(children && children.length > 0 ? { children } : {}),
  }
}

export function quote(content: TextSpan[] = [], attrs?: QuoteAttrs, children?: BlockNode[]): QuoteNode {
  return {
    type: 'quote',
    ...(attrs ? { attrs } : {}),
    content,
    ...(children && children.length > 0 ? { children } : {}),
  }
}

export function codeBlock(code = '', language?: string): CodeBlockNode {
  return {
    type: 'codeBlock',
    ...(language ? { attrs: { language } } : {}),
    content: code ? [{ type: 'text', text: code, marks: [] }] : [],
  }
}

export function divider(): DividerNode {
  return { type: 'divider', content: [] }
}

export function callout(content: TextSpan[] = [], attrs?: CalloutAttrs, children?: BlockNode[]): CalloutNode {
  return {
    type: 'callout',
    ...(attrs ? { attrs } : {}),
    content,
    ...(children && children.length > 0 ? { children } : {}),
  }
}

export function tableCell(content: TextSpan[] = []): TableCellNode {
  return { type: 'tableCell', content }
}

export function tableRow(cells: TableCellNode[]): TableRowNode {
  return { type: 'tableRow', content: [], children: cells }
}

export function table(rows: TableRowNode[], attrs?: TableAttrs): TableNode {
  return { type: 'table', ...(attrs ? { attrs } : {}), content: [], children: rows }
}

/** An empty rows×cols table (first row is the header). */
export function emptyTable(rows = 3, cols = 3): TableNode {
  return table(
    Array.from({ length: rows }, () => tableRow(Array.from({ length: cols }, () => tableCell()))),
  )
}

export function doc(...blocks: BlockNode[]): DocNode {
  return { type: 'doc', children: blocks.length > 0 ? blocks : [paragraph()] }
}

export function emptyDoc(): DocNode {
  return doc()
}
