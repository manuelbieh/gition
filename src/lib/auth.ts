// Auth storage. Two sources, OAuth takes precedence:
//   1. OAuth tokens (from the GitHub App flow via the auth Worker)
//   2. Dev-mode PAT (paste-in fallback; useful for private repos before
//      OAuth is set up, or when the user prefers a fine-grained PAT)

import { getOAuthTokens, clearOAuthTokens } from './oauth'

const KEY = 'gition.devToken.v1'

export type StoredToken = {
  token: string
  addedAt: string
  label?: string
}

export function getToken(): string | null {
  // OAuth tokens win when present
  const oauth = getOAuthTokens()
  if (oauth?.access_token) return oauth.access_token
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return (JSON.parse(raw) as StoredToken).token || null
  } catch {
    return null
  }
}

export function setToken(token: string, label?: string): void {
  const payload: StoredToken = {
    token,
    addedAt: new Date().toISOString(),
    label,
  }
  localStorage.setItem(KEY, JSON.stringify(payload))
}

export function clearToken(): void {
  localStorage.removeItem(KEY)
  clearOAuthTokens()
}

export function getTokenMeta(): StoredToken | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredToken
  } catch {
    return null
  }
}

export function getAuthKind(): 'oauth' | 'pat' | 'none' {
  if (getOAuthTokens()?.access_token) return 'oauth'
  if (localStorage.getItem(KEY)) return 'pat'
  return 'none'
}
