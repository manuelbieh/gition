import { useState, type FormEvent } from 'react'
import { setToken, getTokenMeta, clearToken } from '../lib/auth'
import { beginOAuth, isOAuthConfigured } from '../lib/oauth'

type Props = {
  owner: string
  repo: string
  status: number
  onRetry: () => void
}

export function AuthPrompt({ owner, repo, status, onRetry }: Props) {
  const [pat, setPat] = useState('')
  const meta = getTokenMeta()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!pat.trim()) return
    setToken(pat.trim(), `${owner}/${repo} dev`)
    setPat('')
    onRetry()
  }

  const headline =
    status === 404
      ? `${owner}/${repo} is private or doesn't exist.`
      : status === 401 || status === 403
        ? `Access denied to ${owner}/${repo}.`
        : `Couldn't load ${owner}/${repo}.`

  const oauthAvailable = isOAuthConfigured()

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-2">{headline}</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm leading-relaxed">
          {oauthAvailable
            ? 'Sign in with GitHub for the smoothest experience, or paste a personal access token below.'
            : 'Paste a GitHub personal access token to read this repo.'}
        </p>
        {oauthAvailable && (
          <button
            onClick={() => beginOAuth(location.pathname + location.search)}
            className="w-full mb-4 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        )}
        <form onSubmit={onSubmit}>
          <input
            type="password"
            autoComplete="off"
            placeholder="ghp_… or github_pat_…"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none focus:ring-2 focus:ring-violet-500 mb-3 font-mono text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-500 transition"
            >
              Save & retry
            </button>
            {meta && (
              <button
                type="button"
                onClick={() => {
                  clearToken()
                  onRetry()
                }}
                className="px-4 py-3 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700"
              >
                Clear token
              </button>
            )}
          </div>
        </form>
        {meta && (
          <div className="text-xs text-zinc-500 mt-4">
            Current token saved {new Date(meta.addedAt).toLocaleString()}{' '}
            {meta.label && `(${meta.label})`}
          </div>
        )}
        <a
          href="https://github.com/settings/tokens?type=beta"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-violet-600 hover:underline mt-4 inline-block"
        >
          Create a fine-grained PAT →
        </a>
      </div>
    </div>
  )
}
