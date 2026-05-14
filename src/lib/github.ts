import { getToken } from './auth'

export type RepoRef = {
  owner: string
  repo: string
  branch: string
}

export type TreeEntry = {
  path: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
}

export type RepoMeta = {
  default_branch: string
  private: boolean
  full_name: string
}

export class GitHubError extends Error {
  status: number
  url: string
  constructor(status: number, url: string, message: string) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
    this.url = url
  }
}

async function ghFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const url = `https://api.github.com${path}`
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = (await res.clone().json()) as { message?: string }
      if (body.message) msg = `${msg}: ${body.message}`
    } catch {
      // body not JSON; ignore
    }
    throw new GitHubError(res.status, url, msg)
  }
  return res
}

export async function fetchRepoMeta(
  owner: string,
  repo: string,
): Promise<RepoMeta> {
  const res = await ghFetch(`/repos/${owner}/${repo}`)
  return res.json() as Promise<RepoMeta>
}

export type AuthedUser = {
  login: string
  avatar_url: string
  name: string | null
  id: number
}

export async function fetchAuthedUser(): Promise<AuthedUser> {
  const res = await ghFetch('/user')
  return res.json() as Promise<AuthedUser>
}

export { ghFetch }

export async function fetchTree(ref: RepoRef): Promise<TreeEntry[]> {
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(
      ref.branch,
    )}?recursive=1`,
  )
  const json = (await res.json()) as {
    tree: TreeEntry[]
    truncated: boolean
  }
  if (json.truncated) {
    console.warn('[gition] git tree truncated — repo too large for /git/trees')
  }
  return json.tree
}

// Decodes GitHub's base64-encoded content (which wraps at 60 cols with \n).
function decodeBase64Utf8(b64: string): string {
  const clean = b64.replace(/\s/g, '')
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

export type FileContent = {
  text: string
  sha: string
  path: string
  size: number
}

export async function fetchFile(
  ref: RepoRef,
  path: string,
): Promise<FileContent> {
  const encoded = path
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/contents/${encoded}?ref=${encodeURIComponent(ref.branch)}`,
  )
  const json = (await res.json()) as {
    content: string
    encoding: 'base64'
    sha: string
    path: string
    size: number
  }
  return {
    text: decodeBase64Utf8(json.content),
    sha: json.sha,
    path: json.path,
    size: json.size,
  }
}

// Returns a direct URL for a raw asset (image, etc.). With a token we use the
// authenticated raw endpoint; otherwise the public jsDelivr CDN — no rate
// limit and a long cache.
export function rawUrl(ref: RepoRef, path: string): string {
  const encoded = path
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  if (getToken()) {
    return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(ref.branch)}/${encoded}`
  }
  return `https://cdn.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${ref.branch}/${encoded}`
}
