/**
 * The document model. This JSON tree — not the DOM — is the single source of
 * truth for editor content. The contenteditable layer is only a view over it,
 * and every exporter serializes from it, so output is deterministic across
 * browsers.
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

export type Mark = BoldMark | ItalicMark | CodeMark | LinkMark
export type MarkType = Mark['type']

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

export interface ParagraphNode {
  type: 'paragraph'
  attrs?: ParagraphAttrs
  children: TextSpan[]
}

export interface HeadingNode {
  type: 'heading'
  attrs: HeadingAttrs
  children: TextSpan[]
}

export type BlockNode = ParagraphNode | HeadingNode
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

export function paragraph(children: TextSpan[] = [], attrs?: ParagraphAttrs): ParagraphNode {
  return attrs ? { type: 'paragraph', attrs, children } : { type: 'paragraph', children }
}

export function heading(level: HeadingLevel, children: TextSpan[] = [], attrs?: Omit<HeadingAttrs, 'level'>): HeadingNode {
  return { type: 'heading', attrs: { level, ...attrs }, children }
}

export function doc(...blocks: BlockNode[]): DocNode {
  return { type: 'doc', children: blocks.length > 0 ? blocks : [paragraph()] }
}

export function emptyDoc(): DocNode {
  return doc()
}
