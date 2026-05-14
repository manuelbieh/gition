// Dev-mode PAT storage. Replaced by full OAuth flow in Phase 2.
// Stored unencrypted in localStorage for now; acceptable because (a) this is
// strictly dev-mode and (b) GitHub tokens are scoped per-user and revocable.

const KEY = 'gition.devToken.v1'

export type StoredToken = {
  token: string
  // ISO timestamp for display only; PATs don't expose expiry programmatically
  addedAt: string
  // Optional label like "manuelbieh dev PAT"
  label?: string
}

export function getToken(): string | null {
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
