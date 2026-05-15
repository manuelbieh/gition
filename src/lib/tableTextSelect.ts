import { Extension } from '@tiptap/react'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

// Prevents prosemirror-tables' built-in CellSelection-on-drag. Without
// this, dragging across cell boundaries with the mouse selects whole
// cells rather than text — the opposite of what every Notion-like
// editor user expects.
//
// Strategy: capture mousemove during a left-button drag inside a table
// and force a TextSelection between the mousedown point and the current
// position. CellSelection is still reachable via the row/column handle
// UI (which calls editor APIs directly), just not from text drag.

export const TableTextSelect = Extension.create({
  name: 'tableTextSelect',
  addProseMirrorPlugins() {
    let dragging = false
    let startPos: number | null = null
    return [
      new Plugin({
        key: new PluginKey('tableTextSelect'),
        props: {
          handleDOMEvents: {
            mousedown(view: EditorView, event: MouseEvent) {
              if (event.button !== 0) return false
              const target = event.target as HTMLElement | null
              if (!target?.closest('td, th')) return false
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              })
              if (!pos) return false
              dragging = true
              startPos = pos.pos
              return false
            },
            mousemove(view: EditorView, event: MouseEvent) {
              if (!dragging || startPos === null) return false
              if ((event.buttons & 1) === 0) {
                dragging = false
                startPos = null
                return false
              }
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              })
              if (!pos) return false
              try {
                const sel = TextSelection.create(view.state.doc, startPos, pos.pos)
                if (!view.state.selection.eq(sel)) {
                  view.dispatch(view.state.tr.setSelection(sel))
                }
                event.preventDefault()
                return true
              } catch {
                return false
              }
            },
            mouseup() {
              dragging = false
              startPos = null
              return false
            },
          },
        },
      }),
    ]
  },
})
