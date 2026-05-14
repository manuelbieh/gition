import { getToken } from './auth'
import { GitHubError, type RepoRef } from './github'

// PUT /repos/{owner}/{repo}/contents/{path}
// Used for single-file create/update with optimistic SHA check.
export type PutFileArgs = {
  ref: RepoRef
  path: string
  content: string // utf-8 markdown
  message: string
  sha?: string // omit to create; required to update
  branch?: string
}

export type PutFileResult = {
  content: { sha: string; path: string }
  commit: { sha: string; html_url: string }
}

function toBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export async function putFile(args: PutFileArgs): Promise<PutFileResult> {
  const token = getToken()
  if (!token) throw new Error('Not authenticated — no token available')

  const { ref, path, content, message, sha, branch } = args
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: toBase64Utf8(content),
      sha,
      branch: branch ?? ref.branch,
    }),
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { message?: string }
      if (body.message) detail = `${detail}: ${body.message}`
    } catch {
      // ignore
    }
    throw new GitHubError(res.status, url, detail)
  }
  return res.json() as Promise<PutFileResult>
}
