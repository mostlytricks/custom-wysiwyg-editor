'use client'

import { Editor as CoreEditor, type DocNode } from '@custom-wysiwyg/core'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import {
  BlockGutter as BlockGutterWidget,
  BubbleMenu as BubbleMenuWidget,
  Clawd as ClawdWidget,
  SlashMenu as SlashMenuWidget,
  TableMenu as TableMenuWidget,
  type BubbleMenuOptions,
  type ClawdOptions,
  type SlashMenuItem,
} from '@custom-wysiwyg/ui'

export type { DocNode }
export { CoreEditor }

export interface UseEditorOptions {
  /** Initial document. Changing it after mount does not reset the editor — use editor.setDoc() for that. */
  initialDoc?: DocNode
  /** Called after every document change with the new document. */
  onChange?: (doc: DocNode, editor: CoreEditor) => void
  autoFocus?: boolean
}

export interface UseEditorResult {
  /** Attach to the element the editor should mount into. */
  ref: (element: HTMLElement | null) => void
  /** The core editor instance; null until mounted (and always null during SSR). */
  editor: CoreEditor | null
}

/**
 * Owns a core Editor's lifecycle: creates it when the ref receives an
 * element, destroys it on unmount. The editor is only constructed in the
 * browser (ref callbacks never run during server rendering), which is what
 * makes this SSR-safe without dynamic imports.
 */
export function useEditor(options: UseEditorOptions = {}): UseEditorResult {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const instanceRef = useRef<CoreEditor | null>(null)
  const [editor, setEditor] = useState<CoreEditor | null>(null)

  const ref = useCallback((element: HTMLElement | null) => {
    if (instanceRef.current) {
      instanceRef.current.destroy()
      instanceRef.current = null
    }
    if (element) {
      const instance = new CoreEditor(element, {
        doc: optionsRef.current.initialDoc,
        autofocus: optionsRef.current.autoFocus,
        onChange: (ed) => optionsRef.current.onChange?.(ed.getDoc(), ed),
      })
      instanceRef.current = instance
      setEditor(instance)
    } else {
      setEditor(null)
    }
  }, [])

  return { ref, editor }
}

export interface EditorProps extends UseEditorOptions {
  className?: string
  style?: CSSProperties
  /** Called once the editor instance exists — handy for wiring toolbars. */
  onReady?: (editor: CoreEditor) => void
}

/**
 * Drop-in editor component. The forwarded ref exposes the core Editor
 * instance (commands, getDoc, undo/redo, …).
 */
export const Editor = forwardRef<CoreEditor | null, EditorProps>(function Editor(
  { className, style, onReady, ...options },
  ref,
) {
  const { ref: mountRef, editor } = useEditor(options)

  useImperativeHandle(ref, () => editor as CoreEditor, [editor])

  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  })
  useEffect(() => {
    if (editor) onReadyRef.current?.(editor)
  }, [editor])

  return <div ref={mountRef} className={className} style={style} />
})

/**
 * Floating toolbar over non-collapsed selections (Notion style). Renders
 * nothing itself — it mounts the framework-free widget for the given editor.
 */
export function BubbleMenu({ editor, buttons }: { editor: CoreEditor | null; buttons?: BubbleMenuOptions['buttons'] }) {
  useEffect(() => {
    if (!editor) return
    const widget = new BubbleMenuWidget(editor, buttons ? { buttons } : {})
    return () => widget.destroy()
  }, [editor, buttons])
  return null
}

/** Type '/' for a block palette (Notion style). Mounts the framework-free widget. */
export function SlashMenu({ editor, items }: { editor: CoreEditor | null; items?: SlashMenuItem[] }) {
  useEffect(() => {
    if (!editor) return
    const widget = new SlashMenuWidget(editor, items ? { items } : {})
    return () => widget.destroy()
  }, [editor, items])
  return null
}

/** Hover gutter with `+` insert and `⠿` drag-to-reorder (Notion style). */
export function BlockGutter({ editor }: { editor: CoreEditor | null }) {
  useEffect(() => {
    if (!editor) return
    const widget = new BlockGutterWidget(editor)
    return () => widget.destroy()
  }, [editor])
  return null
}

/** Row/column/table controls shown while the caret is inside a table. */
export function TableMenu({ editor }: { editor: CoreEditor | null }) {
  useEffect(() => {
    if (!editor) return
    const widget = new TableMenuWidget(editor)
    return () => widget.destroy()
  }, [editor])
  return null
}

/** Clawd the corner crab — jazzes at the editor's top-right while you type. Purely cosmetic. */
export function Clawd({ editor, emoji, cooldown }: { editor: CoreEditor | null } & ClawdOptions) {
  useEffect(() => {
    if (!editor) return
    const widget = new ClawdWidget(editor, {
      ...(emoji !== undefined ? { emoji } : {}),
      ...(cooldown !== undefined ? { cooldown } : {}),
    })
    return () => widget.destroy()
  }, [editor, emoji, cooldown])
  return null
}
