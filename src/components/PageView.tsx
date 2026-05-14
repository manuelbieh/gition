import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import matter from 'gray-matter'
import { Buffer } from 'buffer'
import { fetchFile, rawUrl, type RepoRef } from '../lib/github'
import { resolveRelativeRepoPath, type WikiTree } from '../lib/tree'
import { displayName } from '../lib/slug'

// gray-matter ships a CJS bundle that expects a Node Buffer global; polyfill it
// for the browser. Vite tree-shakes this if matter isn't used elsewhere.
;(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer

type Props = {
  ref: RepoRef
  filePath: string
  wiki: WikiTree
  onEdit?: () => void
}

export function PageView({ ref, filePath, wiki, onEdit }: Props) {
  const params = useParams()
  const navigate = useNavigate()

  const file = useQuery({
    queryKey: ['file', ref.owner, ref.repo, ref.branch, filePath],
    queryFn: () => fetchFile(ref, filePath),
  })

  const parsed = useMemo(() => {
    if (!file.data) return null
    try {
      const m = matter(file.data.text)
      return {
        frontmatter: m.data as Record<string, unknown>,
        body: stripLeadingTitleHeading(
          m.content,
          (m.data.title as string | undefined) ?? displayName(filePath),
        ),
      }
    } catch {
      return {
        frontmatter: {},
        body: stripLeadingTitleHeading(file.data.text, displayName(filePath)),
      }
    }
  }, [file.data, filePath])

  const components = useMemo(
    () => ({
      a({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
        if (!href) return <a {...rest}>{children}</a>
        const handled = resolveLink(href, filePath, wiki, params.owner!, params.repo!, ref)
        if (handled.type === 'internal') {
          return (
            <a
              {...rest}
              href={handled.href}
              onClick={(e) => {
                e.preventDefault()
                navigate(handled.href)
              }}
            >
              {children}
            </a>
          )
        }
        if (handled.type === 'asset') {
          return (
            <a {...rest} href={handled.href} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }
        return (
          <a {...rest} href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      },
      img({ src, alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) {
        if (typeof src !== 'string') return <img alt={alt} {...rest} />
        const resolved = resolveImage(src, filePath, ref)
        return <img {...rest} alt={alt ?? ''} src={resolved} loading="lazy" />
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filePath, wiki, params.owner, params.repo, ref.branch],
  )

  if (file.isLoading) {
    return <div className="p-12 text-zinc-500">Loading page…</div>
  }
  if (file.error) {
    return (
      <div className="p-12 text-red-600">
        Error loading page: {(file.error as Error).message}
      </div>
    )
  }
  if (!parsed) return null

  const title = (parsed.frontmatter.title as string | undefined) ?? displayName(filePath)

  return (
    <article className="mx-auto max-w-3xl px-12 py-16 relative">
      {onEdit && (
        <button
          onClick={onEdit}
          className="absolute top-6 right-6 px-3 py-1.5 rounded text-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition"
        >
          Edit
        </button>
      )}
      <header className="mb-8">
        {typeof parsed.frontmatter.icon === 'string' && (
          <div className="text-5xl mb-3">{parsed.frontmatter.icon}</div>
        )}
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
      </header>
      <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-violet-600 dark:prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {parsed.body}
        </ReactMarkdown>
      </div>
    </article>
  )
}

type ResolvedLink =
  | { type: 'internal'; href: string }
  | { type: 'asset'; href: string }
  | { type: 'external' }

function resolveLink(
  href: string,
  fromRepoPath: string,
  wiki: WikiTree,
  owner: string,
  repo: string,
  ref: RepoRef,
): ResolvedLink {
  // External (http://, mailto:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { type: 'external' }
  // Anchor-only
  if (href.startsWith('#')) return { type: 'external' }

  const resolvedRepoPath = resolveRelativeRepoPath(fromRepoPath, href)

  // If it's an internal markdown link to a known page, route via SPA
  if (resolvedRepoPath.toLowerCase().endsWith('.md')) {
    const slug = wiki.byRepoPath.get(resolvedRepoPath)
    if (slug) {
      return { type: 'internal', href: `/${owner}/${repo}/${slug}` }
    }
    // Unknown page — fall through to external view of the source
  }

  // Otherwise treat as an asset (image, pdf, etc.)
  return { type: 'asset', href: rawUrl(ref, resolvedRepoPath) }
}

function resolveImage(src: string, fromRepoPath: string, ref: RepoRef): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return src
  const resolved = resolveRelativeRepoPath(fromRepoPath, src)
  return rawUrl(ref, resolved)
}

// Notion exports include the page title as a leading `# Heading` in the body.
// We render our own title in the page header, so drop the duplicate.
function stripLeadingTitleHeading(body: string, title: string): string {
  const trimmed = body.replace(/^\s+/, '')
  const match = trimmed.match(/^# +(.+?)\s*\n+/)
  if (!match) return body
  const headingText = match[1].trim()
  if (headingText.localeCompare(title, undefined, { sensitivity: 'base' }) !== 0) {
    return body
  }
  return trimmed.slice(match[0].length)
}
