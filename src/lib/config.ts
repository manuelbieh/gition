import { fetchFile, GitHubError, type RepoRef } from './github'

// Per-wiki config file at the repo root. Phase 1 only reads a few keys;
// Phase 2+ will add `autosave`, `publish`, theme, etc. Unknown keys are
// preserved on save so older app versions don't strip newer config.
export type WikiConfig = {
  contentPath: string
  defaultBranch: string | null
  homepage: string | null
}

export const DEFAULT_CONFIG: WikiConfig = {
  contentPath: 'content',
  defaultBranch: null,
  homepage: null,
}

export const CONFIG_FILENAME = 'gition.config.json'

export async function fetchWikiConfig(ref: RepoRef): Promise<WikiConfig> {
  try {
    const file = await fetchFile(ref, CONFIG_FILENAME)
    return parseConfig(file.text)
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) {
      return DEFAULT_CONFIG
    }
    throw err
  }
}

export function parseConfig(text: string): WikiConfig {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    console.warn(`[gition] ${CONFIG_FILENAME} is not valid JSON; using defaults`, err)
    return DEFAULT_CONFIG
  }
  if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG
  const obj = raw as Record<string, unknown>

  const contentPath =
    typeof obj.contentPath === 'string' && obj.contentPath.trim()
      ? obj.contentPath.replace(/\/+$/, '')
      : DEFAULT_CONFIG.contentPath
  const defaultBranch =
    typeof obj.defaultBranch === 'string' && obj.defaultBranch.trim()
      ? obj.defaultBranch
      : null
  const homepage =
    typeof obj.homepage === 'string' && obj.homepage.trim() ? obj.homepage : null

  return { contentPath, defaultBranch, homepage }
}
