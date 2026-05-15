import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAuthedUser, fetchRepoMeta, type RepoRef } from '../lib/github'
import {
  ensureDraftBranch,
  publishDraft,
  resetDraftBranchToTarget,
  uploadAssetToDraftBranch,
  type PublishResult,
} from '../lib/draftBranch'
import {
  fetchWikiConfig,
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  type WikiConfig,
} from '../lib/config'
import { getToken } from '../lib/auth'

export function Settings() {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const owner = params.owner!
  const repo = params.repo!

  const meta = useQuery({
    queryKey: ['repoMeta', owner, repo],
    queryFn: () => fetchRepoMeta(owner, repo),
  })
  const ref: RepoRef | undefined = meta.data
    ? { owner, repo, branch: meta.data.default_branch }
    : undefined

  const config = useQuery({
    queryKey: ['wikiConfig', owner, repo, ref?.branch],
    queryFn: () => fetchWikiConfig(ref!),
    enabled: !!ref,
  })

  const user = useQuery({
    queryKey: ['authedUser'],
    queryFn: fetchAuthedUser,
    enabled: !!getToken(),
  })

  // Local form state
  const [draft, setDraft] = useState<WikiConfig | null>(null)
  useEffect(() => {
    if (config.data && !draft) setDraft({ ...config.data })
  }, [config.data, draft])

  const saveAndPublish = useMutation({
    mutationFn: async (next: WikiConfig) => {
      if (!ref || !user.data) throw new Error('Not signed in')
      const branchInfo = await ensureDraftBranch(ref, user.data.login, ref.branch)
      const json = JSON.stringify(stripDefaults(next), null, 2) + '\n'
      const bytes = new TextEncoder().encode(json)
      await uploadAssetToDraftBranch({
        ref,
        branch: branchInfo.branch,
        path: CONFIG_FILENAME,
        bytes,
        message: `gition: update ${CONFIG_FILENAME}`,
      })
      const result = await publishDraft({
        ref,
        draftBranch: branchInfo.branch,
        targetBranch: ref.branch,
      })
      if (result.kind === 'fast-forward') {
        try {
          await resetDraftBranchToTarget(ref, branchInfo.branch, ref.branch)
        } catch {
          // non-fatal
        }
      }
      queryClient.invalidateQueries({
        queryKey: ['wikiConfig', owner, repo],
      })
      return result
    },
  })

  const onChange = useCallback(<K extends keyof WikiConfig>(k: K, v: WikiConfig[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d))
  }, [])

  if (meta.isLoading || config.isLoading || !draft) {
    return <FullPageMsg>Loading…</FullPageMsg>
  }
  if (meta.error)
    return <FullPageMsg>Error: {(meta.error as Error).message}</FullPageMsg>
  if (!user.data) {
    return (
      <FullPageMsg>
        Settings require sign-in.
        <button
          onClick={() => navigate(`/${owner}/${repo}`)}
          className="ml-2 underline"
        >
          Back to wiki
        </button>
      </FullPageMsg>
    )
  }

  const dirty =
    draft.contentPath !== (config.data?.contentPath ?? DEFAULT_CONFIG.contentPath) ||
    draft.defaultBranch !== config.data?.defaultBranch ||
    draft.homepage !== config.data?.homepage

  return (
    <div className="min-h-screen flex justify-center px-6 py-20">
      <div className="w-full max-w-xl gi-fade-in">
        <button
          onClick={() => navigate(`/${owner}/${repo}`)}
          className="text-[11px] uppercase tracking-[0.22em] text-muted hover:text-ink transition mb-3"
        >
          ← back to wiki
        </button>
        <h1 className="font-display text-[40px] leading-tight mb-3 text-ink">
          Wiki settings
        </h1>
        <p className="text-sm text-ink-2 mb-10 leading-relaxed">
          Stored in{' '}
          <code className="font-mono text-[12.5px] bg-paper-2 border border-line px-1.5 py-0.5 rounded">
            {CONFIG_FILENAME}
          </code>{' '}
          at the root of{' '}
          <code className="font-mono text-[12.5px] text-ink-2">
            {owner}/{repo}
          </code>
          . Saving commits the file via the same draft-and-publish flow used
          for pages.
        </p>

        <div className="space-y-6">
          <Field
            label="Content folder"
            help="Where markdown files live. Default: content/"
          >
            <input
              type="text"
              value={draft.contentPath}
              onChange={(e) => onChange('contentPath', e.target.value)}
              className="gi-input w-full font-mono"
              placeholder="content"
            />
          </Field>
          <Field
            label="Default branch"
            help={`Branch the wiki reads from. Default: ${meta.data?.default_branch}`}
          >
            <input
              type="text"
              value={draft.defaultBranch ?? ''}
              onChange={(e) =>
                onChange('defaultBranch', e.target.value.trim() || null)
              }
              className="gi-input w-full font-mono"
              placeholder={meta.data?.default_branch ?? 'main'}
            />
          </Field>
          <Field
            label="Homepage"
            help="Slug or repo path of the page shown at /:owner/:repo. Default: first index.md / readme.md / first page."
          >
            <input
              type="text"
              value={draft.homepage ?? ''}
              onChange={(e) => onChange('homepage', e.target.value.trim() || null)}
              className="gi-input w-full font-mono"
              placeholder="index"
            />
          </Field>
        </div>

        <div className="mt-10 flex items-center gap-3">
          <button
            disabled={!dirty || saveAndPublish.isPending}
            onClick={() => saveAndPublish.mutate(draft)}
            className="gi-button gi-button-accent"
          >
            {saveAndPublish.isPending ? 'Saving…' : 'Save & publish'}
          </button>
          {saveAndPublish.isError && (
            <span className="text-xs text-red-600">
              {(saveAndPublish.error as Error).message}
            </span>
          )}
          {saveAndPublish.isSuccess && (
            <SuccessHint result={saveAndPublish.data} />
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  help,
  children,
}: {
  label: string
  help: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="text-[13px] font-medium mb-1.5 text-ink">{label}</div>
      {children}
      <div className="text-[11.5px] text-muted mt-1.5">{help}</div>
    </label>
  )
}

function SuccessHint({ result }: { result: PublishResult }) {
  if (result.kind === 'fast-forward')
    return <span className="text-xs text-emerald-600">Saved & published</span>
  if (result.kind === 'pr-opened')
    return (
      <a
        href={result.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-accent hover:underline"
      >
        PR #{result.number} opened
      </a>
    )
  return <span className="text-xs text-muted">Nothing to publish</span>
}

function FullPageMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted text-sm">
      {children}
    </div>
  )
}

// Removes fields whose value equals the default — keeps gition.config.json
// minimal so future schema additions don't make existing files look stale.
function stripDefaults(c: WikiConfig): Partial<WikiConfig> {
  const out: Partial<WikiConfig> = {}
  if (c.contentPath !== DEFAULT_CONFIG.contentPath) out.contentPath = c.contentPath
  if (c.defaultBranch) out.defaultBranch = c.defaultBranch
  if (c.homepage) out.homepage = c.homepage
  return out
}
