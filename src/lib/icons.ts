import { useEffect, useRef, useState } from 'react'
import { get, set } from 'idb-keyval'
import matter from 'gray-matter'
import { Buffer } from 'buffer'
import { getToken } from './auth'
import type { RepoRef } from './github'
import type { WikiTree } from './tree'

;(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer

// Per-page icon resolution: parse frontmatter from each markdown file and
// pluck `icon`. Cached in IndexedDB keyed by the wiki's tree fingerprint
// so we only re-fetch when files change.

type IconMap = Record<string, string>

function cacheKey(ref: RepoRef): string {
  return `icons:${ref.owner}/${ref.repo}@${ref.branch}`
}

type Cached = {
  fingerprint: string
  icons: IconMap
}

async function fetchMarkdownText(
  ref: RepoRef,
  path: string,
  token: string | null,
): Promise<string | null> {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  try {
    if (token) {
      const res = await fetch(
        `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encoded}?ref=${encodeURIComponent(ref.branch)}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
          },
        },
      )
      if (!res.ok) return null
      const j = (await res.json()) as { content: string }
      const bin = atob(j.content.replace(/\s/g, ''))
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder().decode(bytes)
    }
    const res = await fetch(
      `https://cdn.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${ref.branch}/${encoded}`,
    )
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

function parseIcon(text: string): string | undefined {
  try {
    const m = matter(text)
    if (typeof m.data.icon === 'string' && m.data.icon.trim()) {
      return m.data.icon.trim()
    }
  } catch {
    // ignore
  }
  return undefined
}

// Fetches frontmatter for every page in the tree with bounded concurrency.
async function buildIconMap(
  ref: RepoRef,
  wiki: WikiTree,
  onProgress?: (loaded: number, total: number) => void,
): Promise<IconMap> {
  const token = getToken()
  const files = [...wiki.byRepoPath.keys()]
  const total = files.length
  const icons: IconMap = {}
  const concurrency = 6
  let cursor = 0
  let loaded = 0
  async function next(): Promise<void> {
    while (cursor < files.length) {
      const i = cursor++
      const path = files[i]
      const text = await fetchMarkdownText(ref, path, token)
      if (text) {
        const icon = parseIcon(text)
        if (icon) icons[path] = icon
      }
      loaded++
      if (loaded % 20 === 0 || loaded === total) {
        onProgress?.(loaded, total)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next))
  return icons
}

// Hook: loads icons in the background after the tree is available. The
// returned map updates as new icons arrive (or returns cached results
// immediately on a warm load).
export function useIcons(
  ref: RepoRef | undefined,
  wiki: WikiTree | null,
  fingerprint: string | undefined,
) {
  const [icons, setIcons] = useState<IconMap>({})
  const startedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!ref || !wiki || !fingerprint) return
    const key = `${ref.owner}/${ref.repo}@${ref.branch}:${fingerprint}`
    if (startedRef.current === key) return
    startedRef.current = key
    let cancelled = false
    ;(async () => {
      // Try cache first
      const cached = await get<Cached>(cacheKey(ref))
      if (cancelled) return
      if (cached?.fingerprint === fingerprint) {
        setIcons(cached.icons)
        return
      }
      // Build fresh
      const built = await buildIconMap(ref, wiki)
      if (cancelled) return
      setIcons(built)
      void set(cacheKey(ref), { fingerprint, icons: built })
    })()
    return () => {
      cancelled = true
    }
  }, [ref, wiki, fingerprint])

  return icons
}
