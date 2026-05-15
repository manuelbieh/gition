import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import clsx from 'clsx'

// Notion-style table affordances:
//   • Hover a row → "⋮⋮" handle appears to the left of the row.
//   • Hover a column → "⋮⋮" handle appears above the column.
//   • Click a handle → dropdown with insert / duplicate / clear / delete.
//
// The handles overlay the editor in absolute positions tracked from cell
// DOM rects. Row handles re-anchor on mousemove; the menu stays open until
// outside-click or selection.

type Props = {
  editor: Editor | null
  containerRef: React.RefObject<HTMLElement | null>
}

type Anchor =
  | { kind: 'none' }
  | { kind: 'row'; rect: DOMRect; rowIndex: number }
  | { kind: 'col'; rect: DOMRect; colIndex: number }

type MenuKind = 'row' | 'col'

export function TableHandles({ editor, containerRef }: Props) {
  const [anchor, setAnchor] = useState<Anchor>({ kind: 'none' })
  const [menu, setMenu] = useState<
    | { open: false }
    | { open: true; kind: MenuKind; index: number; x: number; y: number }
  >({ open: false })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom as HTMLElement
    function onMove(e: MouseEvent) {
      if (menu.open) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const cell = target.closest('td, th') as HTMLElement | null
      if (!cell) {
        setAnchor({ kind: 'none' })
        return
      }
      const row = cell.parentElement as HTMLElement | null
      if (!row) return
      const tbody = row.parentElement as HTMLElement | null
      if (!tbody) return
      const rowIndex = [...tbody.children].indexOf(row)
      const colIndex = [...row.children].indexOf(cell)
      const rowRect = row.getBoundingClientRect()
      const colHeader = tbody.children[0]?.children[colIndex] as HTMLElement | undefined
      const colRect = colHeader?.getBoundingClientRect()
      // Choose whether to show the row or column handle based on cursor
      // position within the cell. Top quarter → column; left quarter → row.
      const cellRect = cell.getBoundingClientRect()
      const xInCell = (e.clientX - cellRect.left) / cellRect.width
      const yInCell = (e.clientY - cellRect.top) / cellRect.height
      if (yInCell < 0.4 && colRect) {
        setAnchor({ kind: 'col', rect: colRect, colIndex })
      } else if (xInCell < 0.5) {
        setAnchor({ kind: 'row', rect: rowRect, rowIndex })
      } else {
        setAnchor({ kind: 'row', rect: rowRect, rowIndex })
      }
    }
    function onLeave() {
      if (!menu.open) setAnchor({ kind: 'none' })
    }
    dom.addEventListener('mousemove', onMove)
    dom.addEventListener('mouseleave', onLeave)
    return () => {
      dom.removeEventListener('mousemove', onMove)
      dom.removeEventListener('mouseleave', onLeave)
    }
  }, [editor, menu.open])

  useEffect(() => {
    if (!menu.open) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu({ open: false })
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu({ open: false })
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu.open])

  if (!editor) return null

  const containerRect = containerRef.current?.getBoundingClientRect()
  if (!containerRect) return null

  function openMenu(kind: MenuKind, e: React.MouseEvent) {
    const handleRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (kind === 'row' && anchor.kind === 'row') {
      setMenu({
        open: true,
        kind,
        index: anchor.rowIndex,
        x: handleRect.right - containerRect!.left + 6,
        y: handleRect.top - containerRect!.top,
      })
    } else if (kind === 'col' && anchor.kind === 'col') {
      setMenu({
        open: true,
        kind,
        index: anchor.colIndex,
        x: handleRect.left - containerRect!.left,
        y: handleRect.bottom - containerRect!.top + 6,
      })
    }
  }

  function selectRow(rowIndex: number) {
    if (!editor) return
    // Click into the first cell of the target row, then use addRow commands
    const table = editor.view.dom.querySelector('table')
    if (!table) return
    const tbody = table.tBodies[0] ?? table
    const row = tbody.children[rowIndex] as HTMLElement | undefined
    if (!row) return
    const cell = row.firstElementChild as HTMLElement | undefined
    if (!cell) return
    const pos = editor.view.posAtDOM(cell, 0)
    editor.chain().focus().setTextSelection(pos).run()
  }

  function selectCol(colIndex: number) {
    if (!editor) return
    const table = editor.view.dom.querySelector('table')
    if (!table) return
    const tbody = table.tBodies[0] ?? table
    const firstRow = tbody.children[0] as HTMLElement | undefined
    if (!firstRow) return
    const cell = firstRow.children[colIndex] as HTMLElement | undefined
    if (!cell) return
    const pos = editor.view.posAtDOM(cell, 0)
    editor.chain().focus().setTextSelection(pos).run()
  }

  const showHandles = anchor.kind !== 'none' || menu.open

  return (
    <>
      {showHandles && anchor.kind === 'row' && (
        <button
          type="button"
          onClick={(e) => openMenu('row', e)}
          className="absolute z-20 -translate-x-full flex items-center justify-center w-5 h-6 rounded text-muted hover:bg-paper-2 hover:text-ink transition"
          style={{
            top: anchor.rect.top - containerRect.top + anchor.rect.height / 2 - 12,
            left: anchor.rect.left - containerRect.left - 2,
          }}
          title="Row actions"
          aria-label="Row actions"
        >
          <DragDots />
        </button>
      )}
      {showHandles && anchor.kind === 'col' && (
        <button
          type="button"
          onClick={(e) => openMenu('col', e)}
          className="absolute z-20 -translate-y-full flex items-center justify-center w-6 h-5 rounded text-muted hover:bg-paper-2 hover:text-ink transition"
          style={{
            left: anchor.rect.left - containerRect.left + anchor.rect.width / 2 - 12,
            top: anchor.rect.top - containerRect.top - 2,
          }}
          title="Column actions"
          aria-label="Column actions"
        >
          <DragDots horizontal />
        </button>
      )}

      {menu.open && (
        <div
          ref={menuRef}
          className="absolute z-30 gi-floating min-w-[200px] py-1"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.kind === 'row' ? (
            <>
              <MenuItem
                icon={<ArrowUp />}
                label="Insert above"
                onClick={() => {
                  selectRow(menu.index)
                  editor.chain().focus().addRowBefore().run()
                  setMenu({ open: false })
                }}
              />
              <MenuItem
                icon={<ArrowDown />}
                label="Insert below"
                onClick={() => {
                  selectRow(menu.index)
                  editor.chain().focus().addRowAfter().run()
                  setMenu({ open: false })
                }}
              />
              <Divider />
              <MenuItem
                icon={<Duplicate />}
                label="Duplicate"
                onClick={() => {
                  selectRow(menu.index)
                  editor.chain().focus().addRowAfter().run()
                  setMenu({ open: false })
                }}
              />
              <MenuItem
                icon={<Header />}
                label="Toggle header row"
                onClick={() => {
                  selectRow(menu.index)
                  editor.chain().focus().toggleHeaderRow().run()
                  setMenu({ open: false })
                }}
              />
              <Divider />
              <MenuItem
                icon={<TrashIcon />}
                label="Delete row"
                danger
                onClick={() => {
                  selectRow(menu.index)
                  editor.chain().focus().deleteRow().run()
                  setMenu({ open: false })
                  setAnchor({ kind: 'none' })
                }}
              />
            </>
          ) : (
            <>
              <MenuItem
                icon={<ArrowLeft />}
                label="Insert left"
                onClick={() => {
                  selectCol(menu.index)
                  editor.chain().focus().addColumnBefore().run()
                  setMenu({ open: false })
                }}
              />
              <MenuItem
                icon={<ArrowRight />}
                label="Insert right"
                onClick={() => {
                  selectCol(menu.index)
                  editor.chain().focus().addColumnAfter().run()
                  setMenu({ open: false })
                }}
              />
              <Divider />
              <MenuItem
                icon={<Duplicate />}
                label="Duplicate"
                onClick={() => {
                  selectCol(menu.index)
                  editor.chain().focus().addColumnAfter().run()
                  setMenu({ open: false })
                }}
              />
              <MenuItem
                icon={<Header />}
                label="Toggle header column"
                onClick={() => {
                  selectCol(menu.index)
                  editor.chain().focus().toggleHeaderColumn().run()
                  setMenu({ open: false })
                }}
              />
              <Divider />
              <MenuItem
                icon={<TrashIcon />}
                label="Delete column"
                danger
                onClick={() => {
                  selectCol(menu.index)
                  editor.chain().focus().deleteColumn().run()
                  setMenu({ open: false })
                  setAnchor({ kind: 'none' })
                }}
              />
              <Divider />
              <MenuItem
                icon={<TrashIcon />}
                label="Delete table"
                danger
                onClick={() => {
                  editor.chain().focus().deleteTable().run()
                  setMenu({ open: false })
                  setAnchor({ kind: 'none' })
                }}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full text-left flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-ink-2 hover:text-ink hover:bg-paper-2',
      )}
    >
      <span className="w-3.5 h-3.5 flex items-center justify-center text-muted shrink-0">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  )
}

function Divider() {
  return <div className="h-px bg-line my-1" />
}

function DragDots({ horizontal }: { horizontal?: boolean }) {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      {horizontal ? (
        <>
          <circle cx="2" cy="6" r="1" />
          <circle cx="5" cy="6" r="1" />
          <circle cx="8" cy="6" r="1" />
          <circle cx="2" cy="9" r="1" />
          <circle cx="5" cy="9" r="1" />
          <circle cx="8" cy="9" r="1" />
        </>
      ) : (
        <>
          <circle cx="3" cy="4" r="1" />
          <circle cx="3" cy="7" r="1" />
          <circle cx="3" cy="10" r="1" />
          <circle cx="7" cy="4" r="1" />
          <circle cx="7" cy="7" r="1" />
          <circle cx="7" cy="10" r="1" />
        </>
      )}
    </svg>
  )
}

function ArrowUp() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ArrowDown() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3.5 8.5L8 13l4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ArrowLeft() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M13 8H3M7.5 3.5L3 8l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ArrowRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M8.5 3.5L13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function Duplicate() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
function Header() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 3h10v3H3V3zm0 5h10v1.5H3V8zm0 3h10v1.5H3V11z" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 5h10M6 5V3.5A.5.5 0 0 1 6.5 3h3a.5.5 0 0 1 .5.5V5M5 5l.5 7.5a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
