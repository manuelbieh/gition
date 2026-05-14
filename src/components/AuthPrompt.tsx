import { useState, type FormEvent } from 'react'
import { setToken, getTokenMeta, clearToken } from '../lib/auth'

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

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-2">{headline}</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm leading-relaxed">
          During development you can paste a GitHub personal access token to
          read private repos. In Phase 2 this will be replaced by a proper
          OAuth sign-in.
        </p>
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
