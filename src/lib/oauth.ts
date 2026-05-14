// GitHub App OAuth (user-to-server tokens) — talks to the gition auth Worker
// for the code → token exchange and for refreshes. CSRF-protected via the
// `state` parameter stored in sessionStorage.

const STATE_KEY = 'gition.oauth.state'
const RETURN_KEY = 'gition.oauth.returnTo'

export type OAuthTokens = {
  access_token: string
  refresh_token?: string
  expires_in?: number // seconds
  expires_at?: number // ms-epoch (computed)
  token_type: string
  scope?: string
}

const STORAGE_KEY = 'gition.oauth.v1'

function clientId(): string {
  const id = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined
  if (!id) throw new Error('VITE_GITHUB_CLIENT_ID is not set')
  return id
}

function workerUrl(): string {
  const url = import.meta.env.VITE_AUTH_WORKER_URL as string | undefined
  if (!url) throw new Error('VITE_AUTH_WORKER_URL is not set')
  return url.replace(/\/$/, '')
}

export function isOAuthConfigured(): boolean {
  return (
    !!import.meta.env.VITE_GITHUB_CLIENT_ID &&
    !!import.meta.env.VITE_AUTH_WORKER_URL
  )
}

function randomState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function beginOAuth(returnTo?: string): void {
  const state = randomState()
  sessionStorage.setItem(STATE_KEY, state)
  if (returnTo) sessionStorage.setItem(RETURN_KEY, returnTo)
  const redirectUri = `${location.origin}${import.meta.env.BASE_URL}auth/callback`
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  location.href = url.toString()
}

export async function completeOAuth(
  code: string,
  state: string,
): Promise<OAuthTokens> {
  const stored = sessionStorage.getItem(STATE_KEY)
  if (!stored || stored !== state) {
    throw new Error('Invalid OAuth state — refusing to exchange')
  }
  sessionStorage.removeItem(STATE_KEY)
  const res = await fetch(`${workerUrl()}/oauth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) throw new Error(`OAuth exchange failed: ${res.status}`)
  const json = (await res.json()) as Partial<OAuthTokens> & { error?: string }
  if (json.error || !json.access_token) {
    throw new Error(json.error || 'OAuth response missing access_token')
  }
  const tokens = withExpiresAt(json as OAuthTokens)
  saveTokens(tokens)
  return tokens
}

export function consumeReturnTo(): string | null {
  const ret = sessionStorage.getItem(RETURN_KEY)
  sessionStorage.removeItem(RETURN_KEY)
  return ret
}

export function getOAuthTokens(): OAuthTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as OAuthTokens
  } catch {
    return null
  }
}

function saveTokens(tokens: OAuthTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

export function clearOAuthTokens(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function withExpiresAt(t: OAuthTokens): OAuthTokens {
  if (!t.expires_in) return t
  return { ...t, expires_at: Date.now() + t.expires_in * 1000 }
}

// Returns a valid access token, refreshing first if it's about to expire.
// Falls back to null if no tokens are stored or refresh fails.
export async function getValidAccessToken(): Promise<string | null> {
  const t = getOAuthTokens()
  if (!t) return null
  // Refresh if we'll expire in less than 60 seconds
  const ttl = (t.expires_at ?? Infinity) - Date.now()
  if (ttl > 60_000 || !t.refresh_token) return t.access_token
  try {
    const res = await fetch(`${workerUrl()}/oauth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: t.refresh_token }),
    })
    if (!res.ok) throw new Error(`refresh ${res.status}`)
    const json = (await res.json()) as Partial<OAuthTokens> & { error?: string }
    if (json.error || !json.access_token) throw new Error(json.error || 'no token')
    const fresh = withExpiresAt(json as OAuthTokens)
    saveTokens(fresh)
    return fresh.access_token
  } catch (err) {
    console.warn('[gition] token refresh failed', err)
    clearOAuthTokens()
    return null
  }
}
