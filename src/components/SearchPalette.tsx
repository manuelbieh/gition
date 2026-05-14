import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import type { SearchHit, SearchState } from '../lib/search'

type Props = {
  open: boolean
  onClose: () => void
  state: SearchState
  search: (q: string, limit?: number) => SearchHit[]
  onRebuild: () => void
  ownerRepoBase: string
}

export function SearchPalette({
  open,
  onClose,
  state,
  search,
  onRebuild,
  ownerRepoBase,
}: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [hits, setHits] = useState<SearchHit[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // On open: focus + maybe kick off a rebuild
  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      setActive(0)
      return
    }
    inputRef.current?.focus()
    if (state.phase === 'idle') onRebuild()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    setHits(search(query))
    setActive(0)
  }, [query, state.phase, open, search])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, Math.max(0, hits.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const hit = hits[active]
        if (hit) {
          e.preventDefault()
          navigate(`${ownerRepoBase}/${hit.id}`)
          onClose()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, hits, active, navigate, onClose, ownerRepoBase])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 dark:bg-black/60 flex items-start justify-center pt-32 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-zinc-400">
            <path
              fill="currentColor"
              d="M11.5 10h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L16.49 15zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this wiki…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <span className="text-[10px] text-zinc-500">esc</span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {state.phase === 'loading' && (
            <div className="px-4 py-6 text-sm text-zinc-500">
              Indexing… {state.loaded}/{state.total}
            </div>
          )}
          {state.phase === 'error' && (
            <div className="px-4 py-6 text-sm text-red-600">
              Error: {state.message}
              <button
                onClick={onRebuild}
                className="ml-2 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}
          {state.phase === 'ready' && query && hits.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-500">No matches</div>
          )}
          {state.phase === 'ready' && hits.length > 0 && (
            <ul className="py-1">
              {hits.map((h, i) => (
                <li
                  key={h.id}
                  className={clsx(
                    'px-4 py-2 cursor-pointer',
                    i === active
                      ? 'bg-violet-100 dark:bg-violet-500/15'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    navigate(`${ownerRepoBase}/${h.id}`)
                    onClose()
                  }}
                >
                  <div className="font-medium text-sm truncate">{h.title}</div>
                  <div className="text-xs text-zinc-500 truncate">{h.snippet}</div>
                </li>
              ))}
            </ul>
          )}
          {state.phase === 'idle' && (
            <div className="px-4 py-6 text-sm text-zinc-500">
              <button onClick={onRebuild} className="underline hover:no-underline">
                Build search index
              </button>
            </div>
          )}
        </div>
        <div className="px-4 py-2 text-[10px] text-zinc-500 border-t border-zinc-200 dark:border-zinc-800 flex gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
