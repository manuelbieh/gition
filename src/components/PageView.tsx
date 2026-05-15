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
import { relativeTime } from '../lib/presence'
import type { DraftActivity } from '../lib/draftBranch'

;(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer

type Props = {
  ref: RepoRef
  // If provided, read content from this branch (e.g. user's draft branch)
  // and show a banner indicating it's unpublished.
  sourceRef?: RepoRef
  filePath: string
  wiki: WikiTree
  presence?: DraftActivity[]
  onEdit?: () => void
}

export function PageView({
  ref,
  sourceRef,
  filePath,
  wiki,
  presence,
  onEdit,
}: Props) {
  const params = useParams()
  const navigate = useNavigate()
  const readRef = sourceRef ?? ref
  const showingUnpublished = sourceRef && sourceRef.branch !== ref.branch

  const file = useQuery({
    queryKey: ['file', readRef.owner, readRef.repo, readRef.branch, filePath],
    queryFn: () => fetchFile(readRef, filePath),
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
          const basenameClean = import.meta.env.BASE_URL.replace(/\/$/, '')
          const fullHref = `${basenameClean}${handled.href}`
          return (
            <a
              {...rest}
              href={fullHref}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.button === 1) return
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
      table({ children, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
        return (
          <div className="gi-table-wrap">
            <table {...rest}>{children}</table>
          </div>
        )
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filePath, wiki, params.owner, params.repo, ref.branch],
  )

  if (file.isLoading) {
    return <div className="p-12 text-muted text-sm">Loading page…</div>
  }
  if (file.error) {
    return (
      <div className="p-12 text-red-600 text-sm">
        Error loading page: {(file.error as Error).message}
      </div>
    )
  }
  if (!parsed) return null

  const title = (parsed.frontmatter.title as string | undefined) ?? displayName(filePath)
  const icon = typeof parsed.frontmatter.icon === 'string' ? parsed.frontmatter.icon : null

  return (
    <article className="mx-auto max-w-[960px] px-5 sm:px-10 lg:px-14 py-8 sm:py-12 lg:py-16 relative gi-fade-in">
      {onEdit && (
        <button
          onClick={onEdit}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 lg:top-8 lg:right-8 gi-button gi-button-ghost text-[12px]"
        >
          Edit
        </button>
      )}
      <header className="mb-8 sm:mb-10">
        {icon && (
          <div className="text-[44px] sm:text-[52px] lg:text-[56px] leading-none mb-4 sm:mb-5 select-none">
            {icon}
          </div>
        )}
        <h1 className="font-display text-[34px] sm:text-[42px] lg:text-[52px] leading-[1.05] text-ink break-words">
          {title}
        </h1>
        {typeof parsed.frontmatter.description === 'string' && (
          <p className="mt-3 text-ink-2 text-[15px] leading-relaxed">
            {parsed.frontmatter.description}
          </p>
        )}
        {showingUnpublished && (
          <div className="mt-6 flex items-center gap-3 rounded-lg bg-accent-soft border border-line px-3.5 py-2.5">
            <svg width="14" height="14" viewBox="0 0 16 16" className="text-accent shrink-0">
              <path
                fill="currentColor"
                d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.5 4h1v5h-1V4zm0 6h1v1.5h-1V10z"
              />
            </svg>
            <span className="text-[12px] text-accent-ink flex-1">
              <span className="font-medium">Showing your unpublished version.</span>{' '}
              These edits aren&rsquo;t visible to others yet.
            </span>
            {onEdit && (
              <button
                onClick={onEdit}
                className="text-[11px] text-accent-ink underline underline-offset-2 hover:no-underline"
              >
                Continue editing
              </button>
            )}
          </div>
        )}
        {!showingUnpublished && presence && presence.length > 0 && (
          <div className="mt-6 flex items-center gap-3 rounded-lg bg-accent-soft border border-line px-3.5 py-2.5">
            <div className="flex -space-x-2">
              {presence.slice(0, 3).map((d) => (
                <img
                  key={d.username}
                  src={d.authorAvatarUrl ?? ''}
                  alt={d.username}
                  className="w-6 h-6 rounded-full ring-2 ring-paper"
                  title={`@${d.username} · ${relativeTime(d.lastCommitAt)}`}
                />
              ))}
            </div>
            <span className="text-[12px] text-accent-ink flex-1">
              {presence.length === 1 ? (
                <>
                  <span className="font-medium">@{presence[0].username}</span>{' '}
                  has unpublished changes here ·{' '}
                  {relativeTime(presence[0].lastCommitAt)}
                </>
              ) : (
                `${presence.length} drafts on this page`
              )}
            </span>
          </div>
        )}
      </header>
      <div className="prose-gi">
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
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { type: 'external' }
  if (href.startsWith('#')) return { type: 'external' }
  const resolvedRepoPath = resolveRelativeRepoPath(fromRepoPath, href)
  if (resolvedRepoPath.toLowerCase().endsWith('.md')) {
    const slug = wiki.byRepoPath.get(resolvedRepoPath)
    if (slug) {
      return { type: 'internal', href: `/${owner}/${repo}/${slug}` }
    }
  }
  return { type: 'asset', href: rawUrl(ref, resolvedRepoPath) }
}

function resolveImage(src: string, fromRepoPath: string, ref: RepoRef): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return src
  const resolved = resolveRelativeRepoPath(fromRepoPath, src)
  return rawUrl(ref, resolved)
}

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
