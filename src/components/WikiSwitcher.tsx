import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import { getRecents, removeRecent } from '../lib/recents'
import { getAuthKind, clearToken } from '../lib/auth'
import { beginOAuth, isOAuthConfigured } from '../lib/oauth'

type Props = {
  owner: string
  repo: string
}

export function WikiSwitcher({ owner, repo }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const current = `${owner}/${repo}`
  const recents = getRecents().filter((r) => r !== current)
  const authKind = getAuthKind()
  const oauthAvailable = isOAuthConfigured()

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  function pick(slug: string) {
    setOpen(false)
    navigate(`/${slug}`)
  }

  function signOut() {
    clearToken()
    setOpen(false)
    location.reload()
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'w-full text-left flex items-center justify-between gap-2 rounded px-1 py-0.5 -ml-1 transition',
          'hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60',
        )}
      >
        <span className="font-medium truncate">{current}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-zinc-400">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden text-sm">
          {recents.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Recent
              </div>
              {recents.slice(0, 6).map((slug) => (
                <div
                  key={slug}
                  className="group flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  onClick={() => pick(slug)}
                >
                  <span className="truncate">{slug}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecent(slug)
                      setOpen(false)
                      setTimeout(() => setOpen(true), 0)
                    }}
                    className="ml-2 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs"
                    title="Remove from recents"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-zinc-200 dark:border-zinc-800 py-1">
            <button
              onClick={() => {
                setOpen(false)
                navigate(`/${current}/_settings`)
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Wiki settings…
            </button>
            <button
              onClick={() => {
                setOpen(false)
                navigate('/')
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Open another wiki…
            </button>
          </div>
          {(authKind !== 'none' || oauthAvailable) && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 py-1">
              {authKind === 'none' && oauthAvailable && (
                <button
                  onClick={() => {
                    setOpen(false)
                    beginOAuth(location.pathname + location.search)
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Sign in with GitHub
                </button>
              )}
              {authKind !== 'none' && (
                <button
                  onClick={signOut}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                >
                  Sign out
                  {authKind === 'pat' && (
                    <span className="text-[10px] text-zinc-500 ml-2">(clears PAT)</span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
