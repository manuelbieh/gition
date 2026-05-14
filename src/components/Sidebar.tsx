import { useState } from 'react'
import clsx from 'clsx'
import type { WikiNode } from '../lib/tree'

type Props = {
  root: WikiNode
  activeSlug: string
  onNavigate: (slug: string) => void
}

export function Sidebar({ root, activeSlug, onNavigate }: Props) {
  return (
    <nav className="py-2 text-sm">
      {root.children.map((child) => (
        <NodeRow
          key={child.slugPath.join('/')}
          node={child}
          depth={0}
          activeSlug={activeSlug}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

function NodeRow({
  node,
  depth,
  activeSlug,
  onNavigate,
}: {
  node: WikiNode
  depth: number
  activeSlug: string
  onNavigate: (slug: string) => void
}) {
  const slug = node.slugPath.join('/')
  const isActive = activeSlug === slug
  const isAncestor = activeSlug.startsWith(slug + '/')
  const hasChildren = node.children.length > 0
  const [open, setOpen] = useState(() => isActive || isAncestor)

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    if (node.filePath) {
      onNavigate(slug)
      if (hasChildren) setOpen(true)
    } else if (hasChildren) {
      setOpen((v) => !v)
    }
  }

  return (
    <>
      <div
        className={clsx(
          'group flex items-center gap-1 pr-2 py-[3px] cursor-pointer rounded transition-colors',
          isActive
            ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-900 dark:text-violet-200'
            : 'hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300',
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            className="w-4 h-4 flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <Chevron open={open} />
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        <span
          className={clsx(
            'truncate',
            !node.filePath && 'text-zinc-500 dark:text-zinc-400',
          )}
        >
          {node.title}
        </span>
      </div>
      {open &&
        node.children.map((child) => (
          <NodeRow
            key={child.slugPath.join('/')}
            node={child}
            depth={depth + 1}
            activeSlug={activeSlug}
            onNavigate={onNavigate}
          />
        ))}
    </>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform 0.15s' }}
    >
      <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
