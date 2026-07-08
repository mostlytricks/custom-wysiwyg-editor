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

export type Mark = BoldMark | ItalicMark | CodeMark | LinkMark | ColorMark | HighlightMark | FontSizeMark
export type MarkType = Mark['type']

/** The single place tokens become sizes (used by the view and the HTML exporter). */
export const FONT_SIZES: Record<FontSizeToken, string> = {
  small: '0.85em',
  large: '1.25em',
  huge: '1.5em',
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

export type BlockNode = ParagraphNode | HeadingNode | ListItemNode
export type BlockType = BlockNode['type']

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

export function doc(...blocks: BlockNode[]): DocNode {
  return { type: 'doc', children: blocks.length > 0 ? blocks : [paragraph()] }
}

export function emptyDoc(): DocNode {
  return doc()
}
