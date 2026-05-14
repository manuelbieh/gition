import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { completeOAuth, consumeReturnTo } from '../lib/oauth'

export function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) {
      setError('Missing code or state in callback URL')
      return
    }
    completeOAuth(code, state)
      .then(() => {
        const ret = consumeReturnTo()
        navigate(ret || '/', { replace: true })
      })
      .catch((err) => setError((err as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {error ? (
          <>
            <h2 className="text-xl font-semibold mb-2">Sign-in failed</h2>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded bg-zinc-200 dark:bg-zinc-800"
            >
              Back to start
            </button>
          </>
        ) : (
          <p className="text-zinc-500">Signing in…</p>
        )}
      </div>
    </div>
  )
}
