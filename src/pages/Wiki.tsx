import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { displayName } from '../lib/slug'
import { fetchRepoMeta, fetchTree, type RepoRef } from '../lib/github'
import { buildWikiTree } from '../lib/tree'
import { fetchWikiConfig, type WikiConfig } from '../lib/config'
import { Sidebar } from '../components/Sidebar'
import { PageView } from '../components/PageView'
import { Editor } from '../components/Editor'
import { AuthPrompt } from '../components/AuthPrompt'
import { WikiSwitcher } from '../components/WikiSwitcher'
import { GitHubError, fetchAuthedUser } from '../lib/github'
import { getToken } from '../lib/auth'
import { recordRecent } from '../lib/recents'
import { usePresence } from '../lib/presence'
import { useSearch } from '../lib/search'
import { SearchPalette } from '../components/SearchPalette'
import { useUnpublishedState } from '../lib/userContent'
import { useIcons } from '../lib/icons'

export function Wiki() {
  const params = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const owner = params.owner!
  const repo = params.repo!
  const splat = params['*'] ?? ''
  const editMode = searchParams.get('edit') === '1'

  const meta = useQuery({
    queryKey: ['repoMeta', owner, repo],
    queryFn: () => fetchRepoMeta(owner, repo),
  })

  // Read gition.config.json from the repo's default branch. If the config
  // declares a different branch for content, we'll switch to it before
  // fetching the tree.
  const configFetchRef: RepoRef | undefined = meta.data
    ? { owner, repo, branch: meta.data.default_branch }
    : undefined

  const configQuery = useQuery({
    queryKey: ['wikiConfig', owner, repo, configFetchRef?.branch],
    queryFn: () => fetchWikiConfig(configFetchRef!),
    enabled: !!configFetchRef,
  })

  const config: WikiConfig | undefined = configQuery.data
  const effectiveBranch =
    config?.defaultBranch || meta.data?.default_branch

  const ref: RepoRef | undefined = effectiveBranch
    ? { owner, repo, branch: effectiveBranch }
    : undefined

  const tree = useQuery({
    queryKey: ['tree', owner, repo, ref?.branch],
    queryFn: () => fetchTree(ref!),
    enabled: !!ref && !!config,
  })

  const wiki = useMemo(
    () =>
      tree.data && config
        ? buildWikiTree(tree.data, config.contentPath)
        : null,
    [tree.data, config],
  )

  // Soft presence — only when authenticated (anonymous viewers don't get it)
  const presence = usePresence(ref, !!getToken())

  // Per-user unpublished state — drives "view your own draft instead of target"
  const me = useQuery({
    queryKey: ['authedUser'],
    queryFn: fetchAuthedUser,
    enabled: !!getToken(),
    staleTime: Infinity,
  })
  const unpublished = useUnpublishedState(ref, me.data?.login)

  // For the current page, decide whether to read from target or the user's
  // draft branch. If the file has unpublished work, prefer the draft.
  const fileRef: RepoRef | undefined = useMemo(() => {
    if (!ref) return undefined
    if (!wiki || !config) return ref
    const sp = decodeURIComponent(splat).replace(/^\/+|\/+$/g, '')
    const fp = sp ? wiki.bySlug.get(sp) : findHomePage(wiki, config)
    if (fp && unpublished.data?.changedFiles.includes(fp)) {
      return { ...ref, branch: unpublished.data.branch }
    }
    return ref
  }, [ref, splat, wiki, unpublished.data, config])

  // Search + icons — share the tree-fingerprint cache key
  const treeSha = useMemo(() => {
    if (!tree.data || tree.data.length === 0) return undefined
    return tree.data.map((e) => e.sha).join('|').slice(0, 64)
  }, [tree.data])
  const searchApi = useSearch(ref, wiki, treeSha)
  const icons = useIcons(ref, wiki, treeSha)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (meta.isLoading) return <FullPageMessage>Loading repo…</FullPageMessage>
  if (meta.error) {
    const err = meta.error as Error
    const status = err instanceof GitHubError ? err.status : 0
    if (status === 401 || status === 403 || status === 404) {
      return (
        <AuthPrompt
          owner={owner}
          repo={repo}
          status={status}
          onRetry={() => meta.refetch()}
        />
      )
    }
    return <FullPageMessage>Error: {err.message}</FullPageMessage>
  }
  if (!ref || !config) {
    if (configQuery.isLoading) {
      return <FullPageMessage>Loading wiki config…</FullPageMessage>
    }
    return null
  }

  recordRecent(`${owner}/${repo}`)

  if (tree.isLoading) return <FullPageMessage>Loading wiki…</FullPageMessage>
  if (tree.error) {
    return <FullPageMessage>Error: {(tree.error as Error).message}</FullPageMessage>
  }
  if (!wiki) return null

  // The current page slug-path is everything after /:owner/:repo/
  const slugPath = decodeURIComponent(splat).replace(/^\/+|\/+$/g, '')
  const filePath = slugPath
    ? wiki.bySlug.get(slugPath)
    : findHomePage(wiki, config)

  const currentTitle = filePath ? displayName(filePath) : `${owner}/${repo}`

  return (
    <div className="lg:flex h-[100dvh]">
      {/* Sidebar — drawer on small screens, fixed column on lg+ */}
      <aside
        className={clsx(
          'fixed lg:static inset-y-0 left-0 z-40 w-[280px] lg:w-[264px] shrink-0 border-r border-line overflow-y-auto bg-paper-2/95 lg:bg-paper-2/60 backdrop-blur-sm lg:backdrop-blur-none',
          'transform transition-transform duration-200 ease-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 shadow-2xl lg:shadow-none' : '-translate-x-full',
        )}
      >
        <div className="px-4 pt-5 pb-3 sticky top-0 bg-paper-2/95 backdrop-blur-sm z-10 border-b border-line">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted hover:text-ink transition"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              gition
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-muted hover:text-ink p-1 -m-1"
              aria-label="Close sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M4 4l10 10M14 4L4 14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <WikiSwitcher owner={owner} repo={repo} />
          <button
            onClick={() => {
              setSearchOpen(true)
              setSidebarOpen(false)
            }}
            className="mt-3 w-full flex items-center gap-2 text-[13px] text-ink-2 hover:text-ink px-2.5 py-2 rounded-md bg-paper border border-line hover:border-line-2 transition"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" className="text-muted">
              <path fill="currentColor" d="M11.5 10h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L16.49 15zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
            </svg>
            <span>Search</span>
            <span className="ml-auto gi-kbd hidden sm:inline">⌘K</span>
          </button>
        </div>
        <Sidebar
          root={wiki.root}
          activeSlug={slugPath}
          presence={presence.data?.byPath}
          icons={icons}
          onNavigate={(slug) => {
            setSidebarOpen(false)
            navigate(`/${owner}/${repo}${slug ? '/' + slug : ''}`)
          }}
        />
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        state={searchApi.state}
        search={searchApi.search}
        onRebuild={searchApi.rebuild}
        ownerRepoBase={`/${owner}/${repo}`}
      />

      <main className="flex-1 lg:overflow-y-auto min-w-0 flex flex-col h-[100dvh] lg:h-auto">
        {/* Mobile top bar — visible only below lg */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 border-b border-line bg-paper/95 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -m-1 text-ink-2 hover:text-ink"
            aria-label="Open sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="font-display font-display-sm text-[15px] text-ink truncate flex-1">
            {currentTitle}
          </span>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 -m-1 text-ink-2 hover:text-ink"
            aria-label="Search"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.5 10h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L16.49 15zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {filePath ? (
            editMode && getToken() ? (
              <Editor
                key={filePath}
                ref={ref}
                sourceRef={fileRef !== ref ? fileRef : undefined}
                filePath={filePath}
                ownerRepoBase={`/${owner}/${repo}`}
                pageSlug={slugPath}
              />
            ) : (
              <PageView
                ref={ref}
                sourceRef={fileRef !== ref ? fileRef : undefined}
                filePath={filePath}
                wiki={wiki}
                presence={presence.data?.byPath.get(filePath)}
                onEdit={
                  getToken()
                    ? () => navigate(`?edit=1`, { replace: false })
                    : undefined
                }
              />
            )
          ) : (
            <FullPageMessage>
              {slugPath ? `Page not found: ${slugPath}` : 'Empty wiki'}
            </FullPageMessage>
          )}
        </div>
      </main>
    </div>
  )
}

function findHomePage(
  wiki: ReturnType<typeof buildWikiTree>,
  config: WikiConfig,
) {
  // 1. Explicit homepage from gition.config.json (path or slug)
  if (config.homepage) {
    // Try as a slug first, then as a repo path
    const bySlug = wiki.bySlug.get(config.homepage)
    if (bySlug) return bySlug
    if (wiki.byRepoPath.has(config.homepage)) return config.homepage
  }
  // 2. Conventional names at the root
  for (const c of ['index', 'home', 'readme']) {
    const hit = wiki.bySlug.get(c)
    if (hit) return hit
  }
  // 3. First page found in tree order
  for (const child of wiki.root.children) {
    if (child.filePath) return child.filePath
    for (const sub of child.children) {
      if (sub.filePath) return sub.filePath
    }
  }
  return undefined
}

function FullPageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted text-sm">
      {children}
    </div>
  )
}
