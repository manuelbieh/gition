import { useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchRepoMeta, fetchTree, type RepoRef } from '../lib/github'
import { buildWikiTree } from '../lib/tree'
import { fetchWikiConfig, type WikiConfig } from '../lib/config'
import { Sidebar } from '../components/Sidebar'
import { PageView } from '../components/PageView'
import { Editor } from '../components/Editor'
import { AuthPrompt } from '../components/AuthPrompt'
import { WikiSwitcher } from '../components/WikiSwitcher'
import { GitHubError } from '../lib/github'
import { getToken } from '../lib/auth'
import { recordRecent } from '../lib/recents'
import { usePresence } from '../lib/presence'

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

  return (
    <div className="flex h-screen">
      <aside className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-50/95 dark:bg-zinc-900/80 backdrop-blur z-10">
          <button
            onClick={() => navigate('/')}
            className="text-xs uppercase tracking-wider text-zinc-500 hover:text-violet-600 mb-1"
          >
            gition
          </button>
          <WikiSwitcher owner={owner} repo={repo} />
        </div>
        <Sidebar
          root={wiki.root}
          activeSlug={slugPath}
          presence={presence.data?.byPath}
          onNavigate={(slug) =>
            navigate(`/${owner}/${repo}${slug ? '/' + slug : ''}`)
          }
        />
      </aside>
      <main className="flex-1 overflow-y-auto">
        {filePath ? (
          editMode && getToken() ? (
            <Editor
              key={filePath}
              ref={ref}
              filePath={filePath}
              ownerRepoBase={`/${owner}/${repo}`}
              pageSlug={slugPath}
            />
          ) : (
            <PageView
              ref={ref}
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
    <div className="min-h-screen flex items-center justify-center text-zinc-500">
      {children}
    </div>
  )
}
