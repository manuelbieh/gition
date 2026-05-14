import type { TreeEntry } from './github'
import { displayName, slugify } from './slug'

// A node we render in the sidebar. Both files and folders use the same shape;
// folders may have a `filePath` if a Notion-style parent page exists alongside.
export type WikiNode = {
  kind: 'page' | 'section'
  // Path segments from the wiki root, lowercase, slug-form
  slugPath: string[]
  // Display title (Notion ID stripped)
  title: string
  // Original repo path for the markdown file, if any
  filePath?: string
  children: WikiNode[]
}

export type WikiTree = {
  root: WikiNode
  // slug-path (joined by '/') -> repo .md path
  bySlug: Map<string, string>
  // repo .md path -> slug-path (joined by '/')
  byRepoPath: Map<string, string>
}

// Notion sometimes lays out:
//   content/Foo <hash>.md          ← parent page
//   content/Foo/<children>.md      ← children folder, NOTE: hash stripped here
// We pair the .md with its sibling folder when names match (after Notion-ID strip).

export function buildWikiTree(
  entries: TreeEntry[],
  contentPath = 'content',
): WikiTree {
  const prefix = contentPath.endsWith('/') ? contentPath : `${contentPath}/`
  const root: WikiNode = {
    kind: 'section',
    slugPath: [],
    title: 'Wiki',
    children: [],
  }

  // Index every markdown file by its parent-folder repo path
  // so we can later attach pages to their containing folder node.
  const mdEntries = entries.filter(
    (e) => e.type === 'blob' && e.path.startsWith(prefix) && e.path.toLowerCase().endsWith('.md'),
  )
  const folderPaths = new Set(
    entries
      .filter((e) => e.type === 'tree' && (e.path === contentPath || e.path.startsWith(prefix)))
      .map((e) => e.path),
  )

  // Folder repoPath -> WikiNode (lazy create)
  const folderNodeByRepoPath = new Map<string, WikiNode>()
  folderNodeByRepoPath.set(contentPath, root)

  function ensureFolderNode(repoFolderPath: string): WikiNode {
    const existing = folderNodeByRepoPath.get(repoFolderPath)
    if (existing) return existing
    const parentRepoPath = repoFolderPath.includes('/')
      ? repoFolderPath.slice(0, repoFolderPath.lastIndexOf('/'))
      : ''
    const parent = parentRepoPath
      ? ensureFolderNode(parentRepoPath)
      : root
    const folderName = repoFolderPath.split('/').pop()!
    const node: WikiNode = {
      kind: 'section',
      slugPath: [...parent.slugPath, slugify(folderName)],
      title: folderName, // Notion folders don't carry IDs; display as-is
      children: [],
    }
    parent.children.push(node)
    folderNodeByRepoPath.set(repoFolderPath, node)
    return node
  }

  // Pre-create folder nodes so the tree has stable ordering by tree walk.
  for (const folder of [...folderPaths].sort()) {
    if (folder === contentPath) continue
    ensureFolderNode(folder)
  }

  // Now place each .md page into the right folder, or merge it into a sibling
  // folder node if it represents the "parent page" of a same-named folder.
  for (const md of mdEntries) {
    const parentRepoPath = md.path.includes('/')
      ? md.path.slice(0, md.path.lastIndexOf('/'))
      : ''
    const parentFolder = ensureFolderNode(parentRepoPath || contentPath)

    const title = displayName(md.path)
    const slug = slugify(title)

    // Detect "Notion parent page": is there a sibling folder whose name
    // matches `title` (Notion strips the ID from the folder name)?
    const siblingFolderRepoPath = parentRepoPath
      ? `${parentRepoPath}/${title}`
      : `${contentPath}/${title}` // shouldn't happen for top-level but defensive
    const siblingFolder = folderNodeByRepoPath.get(siblingFolderRepoPath)

    if (siblingFolder) {
      // Merge: this .md becomes the folder node's own page.
      siblingFolder.kind = 'page'
      siblingFolder.title = title
      siblingFolder.filePath = md.path
      continue
    }

    // Otherwise, it's a regular leaf page inside parentFolder.
    parentFolder.children.push({
      kind: 'page',
      slugPath: [...parentFolder.slugPath, slug],
      title,
      filePath: md.path,
      children: [],
    })
  }

  // Disambiguate sibling slug collisions (e.g. two pages slugifying to the
  // same value) by appending -2, -3, …
  function dedupe(node: WikiNode) {
    const seen = new Map<string, number>()
    for (const child of node.children) {
      const last = child.slugPath[child.slugPath.length - 1]
      const n = (seen.get(last) ?? 0) + 1
      seen.set(last, n)
      if (n > 1) {
        const newLast = `${last}-${n}`
        child.slugPath = [...child.slugPath.slice(0, -1), newLast]
      }
    }
    for (const child of node.children) dedupe(child)
  }
  dedupe(root)

  // Sort: pages with explicit `order` first (frontmatter — not in v1 wiki data
  // but supported when present), then folders before leaf pages of same name,
  // then alphabetic by title (case-insensitive).
  function sort(node: WikiNode) {
    node.children.sort((a, b) => {
      const aHasKids = a.children.length > 0
      const bHasKids = b.children.length > 0
      if (aHasKids !== bHasKids) return aHasKids ? -1 : 1
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    })
    for (const child of node.children) sort(child)
  }
  sort(root)

  // Build the slug-path ↔ repo path maps by walking the finished tree.
  const bySlug = new Map<string, string>()
  const byRepoPath = new Map<string, string>()
  function walk(node: WikiNode) {
    if (node.filePath) {
      const slug = node.slugPath.join('/')
      bySlug.set(slug, node.filePath)
      byRepoPath.set(node.filePath, slug)
    }
    for (const child of node.children) walk(child)
  }
  walk(root)

  return { root, bySlug, byRepoPath }
}

// Resolves a relative path (as appears in markdown links/images) against the
// repo path of the page containing it. Handles ./ ../ and URL-encoded segments.
export function resolveRelativeRepoPath(
  fromRepoPath: string,
  relative: string,
): string {
  let decoded: string
  try {
    decoded = decodeURI(relative)
  } catch {
    decoded = relative
  }
  // If it's actually an absolute or external URL, leave it alone
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('/')) {
    return decoded
  }
  const parentParts = fromRepoPath.split('/').slice(0, -1)
  const relParts = decoded.split('/')
  for (const part of relParts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      parentParts.pop()
    } else {
      parentParts.push(part)
    }
  }
  return parentParts.join('/')
}
