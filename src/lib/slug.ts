// Notion export filenames end with a 32-char hex ID separated by a space:
//   "Barhopper's Guide 21d95ea4220380b1a1fcc466344ace38.md"
// Strip it for display + URL purposes.
const NOTION_ID_RE = /\s+[0-9a-f]{32}$/i

export function stripNotionId(basename: string): string {
  return basename.replace(NOTION_ID_RE, '')
}

export function basenameWithoutExt(path: string): string {
  const last = path.split('/').pop() ?? path
  return last.replace(/\.md$/i, '')
}

export function displayName(path: string): string {
  return stripNotionId(basenameWithoutExt(path))
}

const COMBINING_MARKS_RE = /[̀-ͯ]/g
const SMART_QUOTES_RE = /[‘-‟'`]/g

export function slugify(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .replace(SMART_QUOTES_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'untitled'
}

export function slugifyFolder(name: string): string {
  return slugify(name)
}
