import { useQuery } from '@tanstack/react-query'
import {
  fetchDraftActivity,
  listDraftBranches,
  type DraftActivity,
} from './draftBranch'
import { type RepoRef } from './github'

export type PresenceMap = Map<string, DraftActivity[]>
export type Presence = {
  byPath: PresenceMap
  drafts: DraftActivity[]
}

// Discovers all draft branches in the repo and resolves them to per-file
// activity entries. Soft polling: refetched every 60s while the tab is
// foregrounded. Authenticated requests are required (anonymous users hit
// rate limits quickly anyway).
export function usePresence(ref: RepoRef | undefined, enabled = true) {
  return useQuery<Presence>({
    queryKey: ['presence', ref?.owner, ref?.repo, ref?.branch],
    queryFn: async () => {
      const refs = await listDraftBranches(ref!)
      const drafts = (
        await Promise.all(
          refs.map((r) => fetchDraftActivity(ref!, r.branch, r.username, ref!.branch)),
        )
      ).filter((d): d is DraftActivity => d !== null)
      const byPath: PresenceMap = new Map()
      for (const d of drafts) {
        for (const path of d.changedFiles) {
          if (!byPath.has(path)) byPath.set(path, [])
          byPath.get(path)!.push(d)
        }
      }
      return { byPath, drafts }
    },
    enabled: !!ref && enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  })
}

// Friendly "N minutes ago" string. Avoids dragging in a date lib.
export function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
