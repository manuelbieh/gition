import { useState } from 'react'
import clsx from 'clsx'
import type { WikiNode } from '../lib/tree'
import type { PresenceMap } from '../lib/presence'

type IconMap = Record<string, string>

type Props = {
  root: WikiNode
  activeSlug: string
  presence?: PresenceMap
  icons?: IconMap
  onNavigate: (slug: string) => void
}

export function Sidebar({ root, activeSlug, presence, icons, onNavigate }: Props) {
  return (
    <nav className="py-2 text-[13px]">
      {root.children.map((child) => (
        <NodeRow
          key={child.slugPath.join('/')}
          node={child}
          depth={0}
          activeSlug={activeSlug}
          presence={presence}
          icons={icons}
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
  presence,
  icons,
  onNavigate,
}: {
  node: WikiNode
  depth: number
  activeSlug: string
  presence?: PresenceMap
  icons?: IconMap
  onNavigate: (slug: string) => void
}) {
  const slug = node.slugPath.join('/')
  const isActive = activeSlug === slug
  const isAncestor = activeSlug.startsWith(slug + '/')
  const hasChildren = node.children.length > 0
  const [open, setOpen] = useState(() => isActive || isAncestor)
  const hasDraft = node.filePath ? !!presence?.get(node.filePath) : false

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
          'group relative flex items-center gap-1 pr-3 py-[3px] cursor-pointer transition-colors',
          isActive
            ? 'text-ink'
            : 'text-ink-2 hover:text-ink hover:bg-paper-2',
        )}
        style={{ paddingLeft: 14 + depth * 14 }}
        onClick={handleClick}
      >
        {isActive && (
          <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-accent rounded-r" />
        )}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            className="w-3.5 h-3.5 flex items-center justify-center text-hush hover:text-ink-2 shrink-0 -ml-1"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <Chevron open={open} />
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0 -ml-1" />
        )}
        <PageIcon node={node} icons={icons} />
        <span
          className={clsx(
            'truncate flex-1',
            !node.filePath && 'text-muted',
            isActive && 'font-medium',
          )}
        >
          {node.title}
        </span>
        {hasDraft && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-accent shrink-0"
            title={`${presence?.get(node.filePath!)?.length ?? 0} draft${
              (presence?.get(node.filePath!)?.length ?? 0) > 1 ? 's' : ''
            }`}
          />
        )}
      </div>
      {open &&
        node.children.map((child) => (
          <NodeRow
            key={child.slugPath.join('/')}
            node={child}
            depth={depth + 1}
            activeSlug={activeSlug}
            presence={presence}
            icons={icons}
            onNavigate={onNavigate}
          />
        ))}
    </>
  )
}

function PageIcon({
  node,
  icons,
}: {
  node: WikiNode
  icons?: IconMap
}) {
  const icon = node.filePath ? icons?.[node.filePath] : undefined
  const display = icon ?? (node.children.length > 0 && !node.filePath ? null : '📄')
  if (display === null) return <span className="w-4 shrink-0" />
  return (
    <span
      className="w-4 h-4 flex items-center justify-center shrink-0 text-[13px] select-none"
      aria-hidden="true"
    >
      {display}
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        transform: `rotate(${open ? 90 : 0}deg)`,
        transition: 'transform 0.15s ease',
      }}
    >
      <path
        d="M3 1l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
