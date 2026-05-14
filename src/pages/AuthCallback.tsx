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

    // OAuth user-authorization callback (the one we initiated with state)
    if (code && state) {
      completeOAuth(code, state)
        .then(() => {
          const ret = consumeReturnTo()
          navigate(ret || '/', { replace: true })
        })
        .catch((err) => setStatus({ kind: 'error', message: (err as Error).message }))
      return
    }

    // GitHub App installation callback — App was installed/updated but no
    // OAuth flow was in progress, so there's no `code`. Friendly confirm.
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
      <div className="w-full max-w-md text-center">
        {status.kind === 'pending' && <p className="text-zinc-500">Signing in…</p>}
        {status.kind === 'installed' && (
          <>
            <h2 className="text-xl font-semibold mb-2">GitHub App installed</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              Installation #{status.installationId} is set up. To actually
              sign in, return to gition and click "Sign in with GitHub".
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded bg-violet-600 text-white font-medium"
            >
              Back to gition
            </button>
          </>
        )}
        {status.kind === 'error' && (
          <>
            <h2 className="text-xl font-semibold mb-2">Sign-in failed</h2>
            <p className="text-sm text-red-600 mb-4">{status.message}</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded bg-zinc-200 dark:bg-zinc-800"
            >
              Back to start
            </button>
          </>
        )}
      </div>
    </div>
  )
}
