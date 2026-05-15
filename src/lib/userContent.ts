// Resolves "what content should I show the current user for this file?".
// Honest model: if the user has unpublished work for this file (either on
// their personal draft branch or in an open PR), show THAT version, with
// a banner. Otherwise show the target branch.

import { useQuery } from '@tanstack/react-query'
import { fetchFile, ghFetch, GitHubError, type RepoRef } from './github'
import {
  compareBranches,
  draftBranchName,
  fetchDraftActivity,
} from './draftBranch'

export type UnpublishedState = {
  branch: string
  changedFiles: string[]
  // Open PR from that branch, if any
  pr: { number: number; url: string; title: string } | null
}

// Lists PRs for a head branch in this user's namespace. Returns the first
// open one (typically there's only one per user-draft branch).
async function fetchOpenPRForBranch(
  ref: RepoRef,
  owner: string,
  branch: string,
): Promise<{ number: number; url: string; title: string } | null> {
  try {
    const res = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/pulls?head=${encodeURIComponent(owner)}:${encodeURIComponent(branch)}&state=open&per_page=1`,
    )
    const json = (await res.json()) as Array<{
      number: number
      html_url: string
      title: string
    }>
    if (json.length === 0) return null
    return {
      number: json[0].number,
      url: json[0].html_url,
      title: json[0].title,
    }
  } catch {
    return null
  }
}

// Returns the user's pending state for the wiki, or null if their draft
// branch is in sync with the target.
export async function fetchUserUnpublishedState(
  ref: RepoRef,
  username: string,
): Promise<UnpublishedState | null> {
  const branch = draftBranchName(username)
  const activity = await fetchDraftActivity(ref, branch, username, ref.branch)
  if (!activity) return null
  const pr = await fetchOpenPRForBranch(ref, ref.owner, branch)
  return {
    branch,
    changedFiles: activity.changedFiles,
    pr,
  }
}

// File-level resolution. Returns the content + sha to use AND the source
// label. If the user has the file modified on their draft branch, we load
// from there; otherwise from the target.
export type ResolvedFileSource = 'target' | 'draft'

export async function fetchFileForUser(
  ref: RepoRef,
  filePath: string,
  unpublished: UnpublishedState | null,
): Promise<{
  text: string
  sha: string
  path: string
  size: number
  source: ResolvedFileSource
}> {
  if (unpublished && unpublished.changedFiles.includes(filePath)) {
    try {
      const file = await fetchFile(
        { ...ref, branch: unpublished.branch },
        filePath,
      )
      return { ...file, source: 'draft' }
    } catch (err) {
      // If the draft branch's file 404s, fall through to target
      if (err instanceof GitHubError && err.status === 404) {
        // continue
      } else {
        throw err
      }
    }
  }
  const file = await fetchFile(ref, filePath)
  return { ...file, source: 'target' }
}

export function useUnpublishedState(
  ref: RepoRef | undefined,
  username: string | undefined,
) {
  return useQuery({
    queryKey: ['unpublished', ref?.owner, ref?.repo, ref?.branch, username],
    queryFn: () => fetchUserUnpublishedState(ref!, username!),
    enabled: !!ref && !!username,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

// Fast existence check used by the cheap "is draft branch ahead?" path
export async function isDraftBranchAhead(
  ref: RepoRef,
  username: string,
): Promise<boolean> {
  try {
    const cmp = await compareBranches(
      ref,
      ref.branch,
      draftBranchName(username),
    )
    return cmp.status === 'ahead'
  } catch {
    return false
  }
}
