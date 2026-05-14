// Search index builder — runs in a Web Worker so the main thread stays
// responsive while we fetch and index hundreds of pages.
//
// Protocol:
//   in:  { type: 'build', files: { path, title, slug }[], tokenAuth, ref, branch }
//   out: { type: 'progress', loaded, total }
//        { type: 'done', serialized }   // serialized index JSON
//        { type: 'error', message }

import MiniSearch from 'minisearch'
import matter from 'gray-matter'
import { Buffer } from 'buffer'

;(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer

type FileSpec = { path: string; title: string; slug: string }
type BuildMsg = {
  type: 'build'
  files: FileSpec[]
  ref: { owner: string; repo: string; branch: string }
  token: string | null
}

type Doc = {
  id: string // slug
  title: string
  path: string
  body: string
}

self.addEventListener('message', async (event: MessageEvent<BuildMsg>) => {
  const msg = event.data
  if (msg.type !== 'build') return
  try {
    const docs = await buildDocs(msg)
    const index = new MiniSearch<Doc>({
      fields: ['title', 'body'],
      storeFields: ['title', 'path', 'body'],
      searchOptions: {
        boost: { title: 3 },
        fuzzy: 0.2,
        prefix: true,
      },
    })
    index.addAll(docs)
    const serialized = JSON.stringify(index)
    self.postMessage({ type: 'done', serialized })
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: (err as Error).message,
    })
  }
})

async function buildDocs(msg: BuildMsg): Promise<Doc[]> {
  const { files, ref, token } = msg
  const total = files.length
  let loaded = 0
  const out: Doc[] = []
  const concurrency = 6
  let cursor = 0
  async function next(): Promise<void> {
    while (cursor < files.length) {
      const i = cursor++
      const f = files[i]
      const text = await fetchRaw(ref, f.path, token)
      const m = safeMatter(text)
      out.push({
        id: f.slug,
        title: (m.frontmatter.title as string | undefined) ?? f.title,
        path: f.path,
        body: m.body,
      })
      loaded++
      if (loaded % 5 === 0 || loaded === total) {
        self.postMessage({ type: 'progress', loaded, total })
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next))
  return out
}

function safeMatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
  try {
    const m = matter(text)
    return { frontmatter: m.data as Record<string, unknown>, body: m.content }
  } catch {
    return { frontmatter: {}, body: text }
  }
}

async function fetchRaw(
  ref: { owner: string; repo: string; branch: string },
  path: string,
  token: string | null,
): Promise<string> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  // Authed: use the GitHub Contents API (works for private + public)
  // Unauthed: use jsDelivr CDN (no rate limit on public repos)
  if (token) {
    const res = await fetch(
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref.branch)}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
        },
      },
    )
    if (!res.ok) throw new Error(`fetch ${path} ${res.status}`)
    const j = (await res.json()) as { content: string }
    const clean = j.content.replace(/\s/g, '')
    const bin = atob(clean)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }
  const res = await fetch(
    `https://cdn.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${ref.branch}/${encodedPath}`,
  )
  if (!res.ok) throw new Error(`fetch ${path} ${res.status}`)
  return res.text()
}
