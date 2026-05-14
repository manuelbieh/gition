import { useEffect, useMemo, useRef, useState } from 'react'
import MiniSearch from 'minisearch'
import { get, set } from 'idb-keyval'
import type { RepoRef } from './github'
import type { WikiTree } from './tree'
import { displayName } from './slug'
import { getToken } from './auth'

type Doc = { id: string; title: string; path: string; body: string }
export type SearchHit = {
  id: string // slug
  score: number
  title: string
  path: string
  snippet: string
}

type CachedIndex = {
  treeSha: string
  serialized: string
}

function cacheKey(ref: RepoRef): string {
  return `search:${ref.owner}/${ref.repo}@${ref.branch}`
}

export type SearchState =
  | { phase: 'idle' }
  | { phase: 'loading'; loaded: number; total: number }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }

export function useSearch(
  ref: RepoRef | undefined,
  wiki: WikiTree | null,
  treeSha: string | undefined,
) {
  const [state, setState] = useState<SearchState>({ phase: 'idle' })
  const indexRef = useRef<MiniSearch<Doc> | null>(null)
  const workerRef = useRef<Worker | null>(null)

  // Try to load a cached index immediately
  useEffect(() => {
    if (!ref || !treeSha) return
    let cancelled = false
    ;(async () => {
      const cached = await get<CachedIndex>(cacheKey(ref))
      if (cancelled) return
      if (cached && cached.treeSha === treeSha) {
        try {
          indexRef.current = MiniSearch.loadJSON<Doc>(cached.serialized, {
            fields: ['title', 'body'],
            storeFields: ['title', 'path', 'body'],
          })
          setState({ phase: 'ready' })
        } catch {
          // fall through and rebuild
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ref, treeSha])

  function rebuild() {
    if (!ref || !wiki || !treeSha) return
    if (workerRef.current) workerRef.current.terminate()
    const files = [...wiki.bySlug.entries()].map(([slug, path]) => ({
      slug,
      path,
      title: displayName(path),
    }))
    if (files.length === 0) {
      setState({ phase: 'ready' })
      return
    }
    setState({ phase: 'loading', loaded: 0, total: files.length })
    const worker = new Worker(
      new URL('./search.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker
    worker.onmessage = (evt) => {
      const msg = evt.data as
        | { type: 'progress'; loaded: number; total: number }
        | { type: 'done'; serialized: string }
        | { type: 'error'; message: string }
      if (msg.type === 'progress') {
        setState({ phase: 'loading', loaded: msg.loaded, total: msg.total })
      } else if (msg.type === 'done') {
        try {
          indexRef.current = MiniSearch.loadJSON<Doc>(msg.serialized, {
            fields: ['title', 'body'],
            storeFields: ['title', 'path', 'body'],
          })
          void set(cacheKey(ref), { treeSha, serialized: msg.serialized })
          setState({ phase: 'ready' })
        } catch (err) {
          setState({ phase: 'error', message: (err as Error).message })
        }
        worker.terminate()
        workerRef.current = null
      } else if (msg.type === 'error') {
        setState({ phase: 'error', message: msg.message })
        worker.terminate()
        workerRef.current = null
      }
    }
    worker.postMessage({
      type: 'build',
      files,
      ref,
      token: getToken(),
    })
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const search = useMemo(() => {
    return (query: string, limit = 8): SearchHit[] => {
      const idx = indexRef.current
      if (!idx || !query.trim()) return []
      const results = idx.search(query, { combineWith: 'AND', prefix: true, fuzzy: 0.2 })
      return results.slice(0, limit).map((r) => {
        const body = (r.body as string) || ''
        const snippet = makeSnippet(body, query)
        return {
          id: String(r.id),
          score: r.score,
          title: (r.title as string) || '',
          path: (r.path as string) || '',
          snippet,
        }
      })
    }
  }, [state.phase === 'ready'])

  return { state, rebuild, search, isReady: state.phase === 'ready' }
}

function makeSnippet(body: string, query: string): string {
  const terms = query
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase())
  const lower = body.toLowerCase()
  let pos = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0) {
      pos = i
      break
    }
  }
  if (pos < 0) return body.slice(0, 120).replace(/\s+/g, ' ').trim()
  const start = Math.max(0, pos - 40)
  const end = Math.min(body.length, pos + 80)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < body.length ? '…' : ''
  return prefix + body.slice(start, end).replace(/\s+/g, ' ').trim() + suffix
}
