const KEY = 'gition.recents.v1'

export function getRecents(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function recordRecent(slug: string): void {
  try {
    const existing = getRecents().filter((x) => x !== slug)
    existing.unshift(slug)
    localStorage.setItem(KEY, JSON.stringify(existing.slice(0, 12)))
  } catch {
    // ignore
  }
}

export function removeRecent(slug: string): void {
  try {
    const next = getRecents().filter((x) => x !== slug)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
