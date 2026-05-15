import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { completeOAuth, consumeReturnTo } from '../lib/oauth'

type Status =
  | { kind: 'pending' }
  | { kind: 'installed'; installationId: string }
  | { kind: 'error'; message: string }

export function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [status, setStatus] = useState<Status>({ kind: 'pending' })

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const installationId = params.get('installation_id')
    const setupAction = params.get('setup_action')

    if (code && state) {
      completeOAuth(code, state)
        .then(() => {
          const ret = consumeReturnTo()
          navigate(ret || '/', { replace: true })
        })
        .catch((err) => setStatus({ kind: 'error', message: (err as Error).message }))
      return
    }

    if (installationId && (setupAction === 'install' || setupAction === 'update')) {
      setStatus({ kind: 'installed', installationId })
      return
    }

    setStatus({
      kind: 'error',
      message: 'No OAuth code or installation info in callback URL',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center gi-fade-in">
        {status.kind === 'pending' && (
          <>
            <div className="inline-flex items-center gap-2 text-sm text-muted">
              <span className="w-3 h-3 rounded-full border border-line-2 border-t-accent animate-spin" />
              Signing in…
            </div>
          </>
        )}
        {status.kind === 'installed' && (
          <>
            <div className="mb-4 inline-flex w-10 h-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              ✓
            </div>
            <h2 className="font-display text-2xl mb-2 text-ink">
              GitHub App installed
            </h2>
            <p className="text-sm text-ink-2 mb-6">
              Installation #{status.installationId} is set up. Return to gition
              and click <span className="font-medium">Sign in with GitHub</span>{' '}
              to authorize the session.
            </p>
            <button
              onClick={() => navigate('/')}
              className="gi-button gi-button-accent"
            >
              Back to gition
            </button>
          </>
        )}
        {status.kind === 'error' && (
          <>
            <h2 className="font-display text-2xl mb-2 text-ink">
              Sign-in failed
            </h2>
            <p className="text-sm text-red-600 mb-6">{status.message}</p>
            <button
              onClick={() => navigate('/')}
              className="gi-button gi-button-ghost"
            >
              Back to start
            </button>
          </>
        )}
      </div>
    </div>
  )
}
