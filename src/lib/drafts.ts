import { get, set, del, keys } from 'idb-keyval'
import type { RepoRef } from './github'

// IndexedDB-backed draft store. Layer 1 of the autosave pipeline — every
// keystroke (debounced) hits this; remote commits drain it.

export type Draft = {
  markdown: string
  baseSha: string
  baseContent: string
  lastEditedAt: string // ISO
}

function key(ref: RepoRef, path: string): string {
  return `draft:${ref.owner}/${ref.repo}@${ref.branch}:${path}`
}

export async function readDraft(
  ref: RepoRef,
  path: string,
): Promise<Draft | undefined> {
  return get<Draft>(key(ref, path))
}

export async function writeDraft(
  ref: RepoRef,
  path: string,
  draft: Draft,
): Promise<void> {
  await set(key(ref, path), draft)
}

export async function clearDraft(ref: RepoRef, path: string): Promise<void> {
  await del(key(ref, path))
}

export async function listDrafts(ref?: RepoRef): Promise<string[]> {
  const all = await keys()
  const prefix = ref
    ? `draft:${ref.owner}/${ref.repo}@${ref.branch}:`
    : 'draft:'
  return all
    .map((k) => String(k))
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
}
