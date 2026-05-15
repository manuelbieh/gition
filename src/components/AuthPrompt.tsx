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
  const oauthAvailable = isOAuthConfigured()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!pat.trim()) return
    setToken(pat.trim(), `${owner}/${repo} dev`)
    setPat('')
    onRetry()
  }

  const headline =
    status === 404
      ? 'This wiki is private or doesn’t exist.'
      : status === 401 || status === 403
        ? 'Access denied'
        : 'Couldn’t load this wiki'

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md gi-fade-in">
        <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-muted">
          <span className="font-mono">{owner}/{repo}</span>
        </div>
        <h2 className="font-display text-[32px] leading-tight mb-3 text-ink">
          {headline}
        </h2>
        <p className="text-ink-2 mb-8 text-sm leading-relaxed">
          {oauthAvailable
            ? 'Sign in with GitHub for the smoothest experience, or paste a personal access token below.'
            : 'Paste a GitHub personal access token to read this repo.'}
        </p>

        {oauthAvailable && (
          <button
            onClick={() => beginOAuth(location.pathname + location.search)}
            className="w-full gi-button gi-button-primary justify-center py-2.5 text-[13px] mb-6"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        )}

        {oauthAvailable && (
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-line" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
              or paste a PAT
            </span>
            <div className="flex-1 h-px bg-line" />
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="password"
            autoComplete="off"
            placeholder="ghp_… or github_pat_…"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            className="gi-input w-full font-mono"
            autoFocus={!oauthAvailable}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 gi-button gi-button-accent justify-center"
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
                className="gi-button gi-button-ghost"
              >
                Clear
              </button>
            )}
          </div>
        </form>
        {meta && (
          <div className="text-xs text-muted mt-4">
            Token saved {new Date(meta.addedAt).toLocaleString()}
            {meta.label && <span> · {meta.label}</span>}
          </div>
        )}
        <a
          href="https://github.com/settings/tokens?type=beta"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent hover:underline mt-5 inline-block"
        >
          Create a fine-grained PAT →
        </a>
      </div>
    </div>
  )
}
