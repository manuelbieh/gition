import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

type Props = {
  editor: Editor | null
}

type MenuState =
  | { kind: 'hidden' }
  | { kind: 'visible'; top: number; left: number; width: number; height: number }

// Floating action bar for tables. Appears above the active table when the
// cursor is inside it. Notion-style: add/delete rows/columns + delete table.
export function TableMenu({ editor }: Props) {
  const [state, setState] = useState<MenuState>({ kind: 'hidden' })

  useEffect(() => {
    if (!editor) return
    function update() {
      if (!editor) return
      const isInTable = editor.isActive('table')
      if (!isInTable) {
        setState({ kind: 'hidden' })
        return
      }
      // Find the DOM node of the enclosing table by climbing from the selection
      const view = editor.view
      const { from } = view.state.selection
      const domAtPos = view.domAtPos(from)
      let node: Node | null = domAtPos.node
      while (node && node.nodeType !== Node.ELEMENT_NODE) {
        node = (node as HTMLElement).parentNode
      }
      let el: HTMLElement | null = node as HTMLElement | null
      while (el && el.tagName !== 'TABLE') {
        el = el.parentElement
      }
      if (!el) {
        setState({ kind: 'hidden' })
        return
      }
      const rect = el.getBoundingClientRect()
      const editorRect = view.dom.getBoundingClientRect()
      setState({
        kind: 'visible',
        top: rect.top - editorRect.top,
        left: rect.left - editorRect.left,
        width: rect.width,
        height: rect.height,
      })
    }
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    editor.on('focus', update)
    editor.on('blur', update)
    update()
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      editor.off('focus', update)
      editor.off('blur', update)
    }
  }, [editor])

  if (!editor || state.kind === 'hidden') return null

  const btn =
    'px-2 py-1 text-xs rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:border-violet-300 dark:hover:border-violet-700 shadow-sm whitespace-nowrap'

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: state.top - 36,
        left: state.left,
        width: state.width,
      }}
    >
      <div className="flex gap-1 pointer-events-auto justify-start">
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().addRowBefore().run()}
          title="Add row above"
        >
          ⬆ Row
        </button>
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().addRowAfter().run()}
          title="Add row below"
        >
          ⬇ Row
        </button>
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().deleteRow().run()}
          title="Delete row"
        >
          ✕ Row
        </button>
        <span className="w-px bg-zinc-200 dark:bg-zinc-700" />
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          title="Add column left"
        >
          ⬅ Col
        </button>
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          title="Add column right"
        >
          ➡ Col
        </button>
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().deleteColumn().run()}
          title="Delete column"
        >
          ✕ Col
        </button>
        <span className="w-px bg-zinc-200 dark:bg-zinc-700" />
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          title="Toggle header row"
        >
          H
        </button>
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().deleteTable().run()}
          title="Delete table"
        >
          ✕ Table
        </button>
      </div>
    </div>
  )
}
