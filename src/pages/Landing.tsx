import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { beginOAuth, isOAuthConfigured } from '../lib/oauth'
import { getAuthKind } from '../lib/auth'
import { getRecents } from '../lib/recents'

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
    <div className="min-h-screen flex items-center justify-center px-6 relative">
      {oauthAvailable && (
        <div className="absolute top-4 right-6 text-xs">
          {authKind === 'oauth' ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Signed in
            </span>
          ) : (
            <button
              onClick={() => beginOAuth(location.pathname + location.search)}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
            >
              Sign in with GitHub →
            </button>
          )}
        </div>
      )}
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
          <p className="mt-3 text-xs text-zinc-500">
            Public repos work without signing in. Sign in for private repos or to edit.
          </p>
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
