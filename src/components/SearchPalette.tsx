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
      className="fixed inset-0 z-50 gi-modal-backdrop flex items-start justify-center pt-[12vh] sm:pt-[18vh] px-3 sm:px-4 gi-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] gi-floating overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line">
          <svg width="15" height="15" viewBox="0 0 16 16" className="text-muted">
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
            className="flex-1 bg-transparent outline-none text-[14px] text-ink placeholder:text-hush"
          />
          <span className="gi-kbd">esc</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {state.phase === 'loading' && (
            <div className="px-4 py-8 text-sm text-muted flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border border-line-2 border-t-accent animate-spin" />
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
            <div className="px-4 py-8 text-sm text-muted">No matches</div>
          )}
          {state.phase === 'ready' && !query && (
            <div className="px-4 py-8 text-sm text-muted">
              Type to search across all pages.
            </div>
          )}
          {state.phase === 'ready' && hits.length > 0 && (
            <ul className="py-1.5">
              {hits.map((h, i) => (
                <li
                  key={h.id}
                  className={clsx(
                    'mx-1.5 px-3 py-2 rounded-md cursor-pointer transition-colors',
                    i === active
                      ? 'bg-accent-soft'
                      : 'hover:bg-paper-2',
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    navigate(`${ownerRepoBase}/${h.id}`)
                    onClose()
                  }}
                >
                  <div className="font-display font-display-sm text-[14px] text-ink truncate">
                    {h.title}
                  </div>
                  <div className="text-[11px] text-muted truncate mt-0.5 font-mono">
                    {h.snippet}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {state.phase === 'idle' && (
            <div className="px-4 py-8 text-sm text-muted">
              <button onClick={onRebuild} className="underline hover:no-underline">
                Build search index
              </button>
            </div>
          )}
        </div>
        <div className="hidden sm:flex px-4 py-2.5 text-[11px] text-muted border-t border-line gap-4">
          <span className="flex items-center gap-1.5">
            <span className="gi-kbd">↑</span>
            <span className="gi-kbd">↓</span> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="gi-kbd">↵</span> open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="gi-kbd">esc</span> close
          </span>
        </div>
      </div>
    </div>
  )
}
