import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
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
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          gition
        </div>
        {oauthAvailable &&
          (authKind === 'oauth' ? (
            <span className="inline-flex items-center gap-2 text-xs text-ink-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Signed in
            </span>
          ) : (
            <button
              onClick={() => beginOAuth(location.pathname + location.search)}
              className="text-xs text-muted hover:text-ink transition"
            >
              Sign in with GitHub →
            </button>
          ))}
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-xl gi-fade-in">
          <div className="mb-6 text-[11px] uppercase tracking-[0.22em] text-muted">
            wikis, bound to GitHub
          </div>
          <h1 className="font-display text-[64px] leading-[0.95] mb-4 text-ink">
            Write{' '}
            <span className="font-display-italic text-accent">together,</span>
            <br /> stored as markdown.
          </h1>
          <p className="text-ink-2 mb-10 max-w-md text-[15px] leading-relaxed">
            Open any GitHub repository as a Notion-style wiki. Read it
            anonymously, sign in to edit. Your content lives as markdown —
            yours, portable, version-controlled.
          </p>

          <form onSubmit={onSubmit} className="flex gap-2 mb-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="owner/repo or github.com/owner/repo"
              className="gi-input flex-1"
              autoFocus
            />
            <button type="submit" className="gi-button gi-button-accent">
              Open →
            </button>
          </form>
          {oauthAvailable && authKind !== 'oauth' && (
            <p className="text-xs text-muted">
              Public repos open without signing in. Sign in for private repos
              and to edit.
            </p>
          )}

          {recents.length > 0 && (
            <div className="mt-14">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted mb-3">
                Recent
              </div>
              <ul className="space-y-px">
                {recents.slice(0, 8).map((r) => (
                  <li key={r}>
                    <Link
                      to={`/${r}`}
                      className="group flex items-center justify-between px-3 py-2 -mx-3 rounded-md hover:bg-paper-2 transition text-ink-2 hover:text-ink"
                    >
                      <span className="font-mono text-[13px]">{r}</span>
                      <span className="text-muted text-xs opacity-0 group-hover:opacity-100 transition">
                        Open →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-6 text-[11px] uppercase tracking-[0.18em] text-hush flex items-center justify-between">
        <span>Markdown · GitHub · no servers</span>
        <a
          href="https://github.com/manuelbieh/gition"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink transition"
        >
          source ↗
        </a>
      </footer>
    </div>
  )
}
