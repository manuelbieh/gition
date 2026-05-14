import { ghFetch, GitHubError, type RepoRef } from './github'

// Layer 2 of the autosave pipeline: per-user draft branches with session squash.
// Branch naming: `gition/drafts/<github-username>`. One branch per editor,
// regardless of how many pages they're working on.

export type DraftBranchInfo = {
  branch: string
  headSha: string
}

export type AutosaveSession = {
  // SHA the page-session is rooted at (parent of all session commits)
  rootSha: string
  // SHA of the most recent commit we made for THIS page in THIS session
  lastCommitSha: string
}

export function draftBranchName(username: string): string {
  return `gition/drafts/${username}`
}

async function getRef(
  ref: RepoRef,
  refPath: string,
): Promise<{ ref: string; object: { sha: string; type: string } } | null> {
  try {
    const res = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/git/ref/${refPath}`,
    )
    return res.json() as Promise<{ ref: string; object: { sha: string; type: string } }>
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null
    throw err
  }
}

export async function ensureDraftBranch(
  ref: RepoRef,
  username: string,
  targetBranch: string,
): Promise<DraftBranchInfo> {
  const branch = draftBranchName(username)
  const existing = await getRef(ref, `heads/${branch}`)
  if (existing) return { branch, headSha: existing.object.sha }

  // Need to create the branch from the target branch's HEAD.
  const target = await getRef(ref, `heads/${targetBranch}`)
  if (!target) {
    throw new Error(`Target branch '${targetBranch}' not found`)
  }
  const created = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/refs`,
    {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: target.object.sha,
      }),
      headers: { 'Content-Type': 'application/json' },
    },
  )
  const json = (await created.json()) as { object: { sha: string } }
  return { branch, headSha: json.object.sha }
}

// Single source of truth for what's currently at the tip of the draft branch.
export async function getBranchHead(
  ref: RepoRef,
  branch: string,
): Promise<{ commitSha: string; treeSha: string }> {
  const refRes = await getRef(ref, `heads/${branch}`)
  if (!refRes) throw new Error(`Branch '${branch}' not found`)
  const commitRes = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/commits/${refRes.object.sha}`,
  )
  const commit = (await commitRes.json()) as { sha: string; tree: { sha: string } }
  return { commitSha: commit.sha, treeSha: commit.tree.sha }
}

async function createBlob(ref: RepoRef, content: string): Promise<string> {
  // base64-encode utf-8 → blob to preserve arbitrary content faithfully
  const bytes = new TextEncoder().encode(content)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/blobs`,
    {
      method: 'POST',
      body: JSON.stringify({ content: btoa(bin), encoding: 'base64' }),
      headers: { 'Content-Type': 'application/json' },
    },
  )
  const json = (await res.json()) as { sha: string }
  return json.sha
}

async function createTree(
  ref: RepoRef,
  baseTreeSha: string,
  path: string,
  blobSha: string,
): Promise<string> {
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          {
            path,
            mode: '100644',
            type: 'blob',
            sha: blobSha,
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    },
  )
  const json = (await res.json()) as { sha: string }
  return json.sha
}

async function createCommit(
  ref: RepoRef,
  message: string,
  treeSha: string,
  parentSha: string,
): Promise<string> {
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha],
      }),
      headers: { 'Content-Type': 'application/json' },
    },
  )
  const json = (await res.json()) as { sha: string }
  return json.sha
}

async function updateRef(
  ref: RepoRef,
  refPath: string,
  sha: string,
  force = false,
): Promise<void> {
  await ghFetch(`/repos/${ref.owner}/${ref.repo}/git/refs/${refPath}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha, force }),
    headers: { 'Content-Type': 'application/json' },
  })
}

export type CompareStatus = 'identical' | 'ahead' | 'behind' | 'diverged'

export async function compareBranches(
  ref: RepoRef,
  base: string,
  head: string,
): Promise<{ status: CompareStatus; ahead_by: number; behind_by: number }> {
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  )
  const json = (await res.json()) as {
    status: CompareStatus
    ahead_by: number
    behind_by: number
  }
  return json
}

export type PublishResult =
  | { kind: 'nothing-to-publish' }
  | { kind: 'fast-forward'; targetHeadSha: string }
  | { kind: 'pr-opened'; url: string; number: number }

export async function publishDraft(args: {
  ref: RepoRef
  draftBranch: string
  targetBranch: string
}): Promise<PublishResult> {
  const { ref, draftBranch, targetBranch } = args
  const cmp = await compareBranches(ref, targetBranch, draftBranch)

  if (cmp.status === 'identical' || cmp.status === 'behind') {
    return { kind: 'nothing-to-publish' }
  }

  const draftHead = await getBranchHead(ref, draftBranch)

  if (cmp.status === 'ahead') {
    // Pure fast-forward
    try {
      await updateRef(ref, `heads/${targetBranch}`, draftHead.commitSha, false)
      // Reset draft branch back to target (now they match)
      // Skipped: target == draft after FF, no reset needed
      return { kind: 'fast-forward', targetHeadSha: draftHead.commitSha }
    } catch (err) {
      if (err instanceof GitHubError && err.status === 422) {
        // Race: target moved between compare and update; fall through to PR
      } else {
        throw err
      }
    }
  }

  // Diverged (or FF race) — open a PR as the safe fallback
  const prRes = await ghFetch(`/repos/${ref.owner}/${ref.repo}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'gition: publish drafts',
      head: draftBranch,
      base: targetBranch,
      body:
        'Drafts created via gition. The drafts branch and target have diverged, so this is opened as a PR for review.',
    }),
  })
  const pr = (await prRes.json()) as { html_url: string; number: number }
  return { kind: 'pr-opened', url: pr.html_url, number: pr.number }
}

// Resets the draft branch to point at the target branch's HEAD. Use after a
// successful publish so the draft branch doesn't accumulate stale state.
// Safe to force because nobody else writes to your draft branch.
export async function resetDraftBranchToTarget(
  ref: RepoRef,
  draftBranch: string,
  targetBranch: string,
): Promise<void> {
  const target = await getRef(ref, `heads/${targetBranch}`)
  if (!target) throw new Error(`Target branch '${targetBranch}' not found`)
  await updateRef(ref, `heads/${draftBranch}`, target.object.sha, true)
}

// Lists all gition/drafts/* branches in the repo. Used to discover other
// users' active drafts for soft presence.
export type DraftBranchRef = {
  branch: string
  username: string
  sha: string
}

export async function listDraftBranches(
  ref: RepoRef,
): Promise<DraftBranchRef[]> {
  try {
    const res = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/git/matching-refs/heads/gition/drafts/`,
    )
    const refs = (await res.json()) as Array<{
      ref: string
      object: { sha: string }
    }>
    return refs.map((r) => ({
      branch: r.ref.replace(/^refs\/heads\//, ''),
      username: r.ref.replace(/^refs\/heads\/gition\/drafts\//, ''),
      sha: r.object.sha,
    }))
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return []
    throw err
  }
}

// Returns the set of file paths changed between target and the draft branch,
// along with the latest commit's author + timestamp.
export type DraftActivity = {
  branch: string
  username: string
  aheadBy: number
  changedFiles: string[]
  lastCommitAt: string | null
  authorAvatarUrl: string | null
}

export async function fetchDraftActivity(
  ref: RepoRef,
  draftBranch: string,
  username: string,
  targetBranch: string,
): Promise<DraftActivity | null> {
  try {
    const res = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/compare/${encodeURIComponent(targetBranch)}...${encodeURIComponent(draftBranch)}`,
    )
    const json = (await res.json()) as {
      ahead_by: number
      files?: Array<{ filename: string }>
      commits?: Array<{
        commit: { author?: { date?: string } }
        author?: { avatar_url?: string }
      }>
    }
    if (json.ahead_by <= 0) return null
    const lastCommit = json.commits?.[json.commits.length - 1]
    return {
      branch: draftBranch,
      username,
      aheadBy: json.ahead_by,
      changedFiles: (json.files ?? []).map((f) => f.filename),
      lastCommitAt: lastCommit?.commit.author?.date ?? null,
      authorAvatarUrl: lastCommit?.author?.avatar_url ?? null,
    }
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null
    throw err
  }
}

export type AutosaveResult = {
  newCommitSha: string
  newSession: AutosaveSession
  squashed: boolean
}

// Writes a single file to the draft branch. Within a page-session (session !== null),
// the new commit's parent is pinned to session.rootSha — so successive saves
// collapse into one effective commit. Across sessions, parent = current branch
// HEAD. We always force-update the ref because the branch is per-user.
export async function autosaveToDraftBranch(args: {
  ref: RepoRef
  branch: string
  path: string
  content: string
  message: string
  session: AutosaveSession | null
}): Promise<AutosaveResult> {
  const { ref, branch, path, content, message, session } = args

  // Determine the parent commit:
  //   - mid-session: use the session root (squash)
  //   - first save of a session: use the current branch HEAD
  let parentSha: string
  let baseTreeSha: string

  if (session) {
    parentSha = session.rootSha
    const parentRes = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/git/commits/${parentSha}`,
    )
    const parentCommit = (await parentRes.json()) as { tree: { sha: string } }
    baseTreeSha = parentCommit.tree.sha
  } else {
    const head = await getBranchHead(ref, branch)
    parentSha = head.commitSha
    baseTreeSha = head.treeSha
  }

  const blobSha = await createBlob(ref, content)
  const treeSha = await createTree(ref, baseTreeSha, path, blobSha)
  const newCommitSha = await createCommit(ref, message, treeSha, parentSha)

  // Always force — only this user writes to this branch, and force lets us
  // squash by jumping the ref past prior session commits.
  await updateRef(ref, `heads/${branch}`, newCommitSha, true)

  return {
    newCommitSha,
    newSession: {
      rootSha: parentSha,
      lastCommitSha: newCommitSha,
    },
    squashed: session !== null,
  }
}
