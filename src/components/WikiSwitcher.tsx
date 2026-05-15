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

  const [ownerPart, repoPart] = [owner, repo]

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'w-full text-left flex items-center gap-2 rounded-md px-2 -mx-2 py-1.5 transition',
          'hover:bg-paper border border-transparent hover:border-line',
        )}
      >
        <span className="font-display font-display-sm text-[15px] text-ink truncate flex-1">
          <span className="text-muted font-sans text-[13px]">{ownerPart}/</span>
          {repoPart}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="shrink-0 text-muted"
        >
          <path
            d="M2 4l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 gi-floating text-sm overflow-hidden">
          {recents.length > 0 && (
            <div className="py-1.5">
              <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted">
                Recent
              </div>
              {recents.slice(0, 6).map((slug) => (
                <div
                  key={slug}
                  className="group flex items-center justify-between px-3 py-1.5 hover:bg-paper-2 cursor-pointer"
                  onClick={() => pick(slug)}
                >
                  <span className="truncate font-mono text-[12px] text-ink-2 group-hover:text-ink">
                    {slug}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecent(slug)
                      setOpen(false)
                      setTimeout(() => setOpen(true), 0)
                    }}
                    className="ml-2 opacity-0 group-hover:opacity-100 text-muted hover:text-ink text-xs"
                    title="Remove from recents"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-line py-1.5">
            <button
              onClick={() => {
                setOpen(false)
                navigate(`/${current}/_settings`)
              }}
              className="w-full text-left px-3 py-1.5 text-ink-2 hover:text-ink hover:bg-paper-2 transition flex items-center gap-2"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" className="text-muted">
                <path
                  fill="currentColor"
                  d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z M9.796 1.343a1.873 1.873 0 0 0-3.592 0l-.376 1.226a7.013 7.013 0 0 0-.866.5l-1.247-.232a1.873 1.873 0 0 0-1.916 2.804l.654 1.041a7.087 7.087 0 0 0-.151 1l-.967.85a1.873 1.873 0 0 0 0 2.937l.967.85a7.087 7.087 0 0 0 .151 1l-.654 1.04A1.873 1.873 0 0 0 3.715 13.16l1.247-.232c.276.193.566.36.866.5l.376 1.226a1.873 1.873 0 0 0 3.592 0l.376-1.226c.3-.14.59-.307.866-.5l1.247.232a1.873 1.873 0 0 0 1.916-2.804l-.654-1.041c.084-.327.135-.66.151-1l.967-.85a1.873 1.873 0 0 0 0-2.937l-.967-.85a7.087 7.087 0 0 0-.151-1l.654-1.04a1.873 1.873 0 0 0-1.916-2.805l-1.247.232a7.013 7.013 0 0 0-.866-.5l-.376-1.226z"
                />
              </svg>
              Wiki settings
            </button>
            <button
              onClick={() => {
                setOpen(false)
                navigate('/')
              }}
              className="w-full text-left px-3 py-1.5 text-ink-2 hover:text-ink hover:bg-paper-2 transition flex items-center gap-2"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" className="text-muted">
                <path
                  fill="currentColor"
                  d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8zm6.5-3.5v3h3v1h-3v3h-1v-3h-3v-1h3v-3h1z"
                />
              </svg>
              Open another wiki…
            </button>
          </div>
          {(authKind !== 'none' || oauthAvailable) && (
            <div className="border-t border-line py-1.5">
              {authKind === 'none' && oauthAvailable && (
                <button
                  onClick={() => {
                    setOpen(false)
                    beginOAuth(location.pathname + location.search)
                  }}
                  className="w-full text-left px-3 py-1.5 text-ink-2 hover:text-ink hover:bg-paper-2 transition"
                >
                  Sign in with GitHub
                </button>
              )}
              {authKind !== 'none' && (
                <button
                  onClick={signOut}
                  className="w-full text-left px-3 py-1.5 text-ink-2 hover:text-ink hover:bg-paper-2 transition flex items-center gap-2"
                >
                  <span>Sign out</span>
                  {authKind === 'pat' && (
                    <span className="text-[10px] text-muted">(clears PAT)</span>
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
