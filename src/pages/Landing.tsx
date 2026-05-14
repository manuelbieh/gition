import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { beginOAuth, isOAuthConfigured } from '../lib/oauth'
import { getAuthKind } from '../lib/auth'

const RECENT_KEY = 'gition.recents.v1'

function getRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function Landing() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const recents = getRecents()
  const authKind = getAuthKind()
  const oauthAvailable = isOAuthConfigured()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    const match = trimmed.match(/(?:github\.com\/)?([^\/\s]+)\/([^\/\s?#]+)/)
    if (!match) return
    const [, owner, repo] = match
    const cleanRepo = repo.replace(/\.git$/, '')
    navigate(`/${owner}/${cleanRepo}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <h1 className="text-4xl font-semibold tracking-tight mb-2">
          gition
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          Open any GitHub repo as a Notion-style wiki.
        </p>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="owner/repo or github.com/owner/repo"
            className="flex-1 px-4 py-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none focus:ring-2 focus:ring-violet-500"
            autoFocus
          />
          <button
            type="submit"
            className="px-5 py-3 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-500 transition"
          >
            Open
          </button>
        </form>
        {oauthAvailable && authKind !== 'oauth' && (
          <button
            onClick={() => beginOAuth(location.pathname + location.search)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        )}
        {authKind === 'oauth' && (
          <p className="mt-4 text-xs text-emerald-600">Signed in with GitHub</p>
        )}
        {recents.length > 0 && (
          <div className="mt-10">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
              Recent
            </div>
            <ul className="space-y-1">
              {recents.slice(0, 8).map((r) => (
                <li key={r}>
                  <a
                    href={`/${r}`}
                    className="text-zinc-700 dark:text-zinc-300 hover:text-violet-600 dark:hover:text-violet-400"
                  >
                    {r}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
