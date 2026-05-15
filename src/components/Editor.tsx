import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Markdown } from 'tiptap-markdown'
import { TableMenu } from './TableMenu'
import { EditorBubbleMenu } from './EditorBubbleMenu'
import { SlashCommand } from './SlashMenu'
import matter from 'gray-matter'
import { fetchFile, fetchAuthedUser, type RepoRef } from '../lib/github'
import {
  autosaveToDraftBranch,
  ensureDraftBranch,
  publishDraft,
  resetDraftBranchToTarget,
  uploadAssetToDraftBranch,
  type AutosaveSession,
  type DraftBranchInfo,
  type PublishResult,
} from '../lib/draftBranch'
import { slugify } from '../lib/slug'
import { FrontmatterControls, type Frontmatter } from './FrontmatterControls'
import { readDraft, writeDraft, clearDraft } from '../lib/drafts'
import { displayName } from '../lib/slug'

type WithMarkdown = {
  storage: { markdown: { getMarkdown: () => string } }
}

type Props = {
  ref: RepoRef
  filePath: string
  ownerRepoBase: string
  pageSlug: string
}

// Autosave timing (Phase 2 defaults; configurable later via gition.config.json)
const IDLE_MS = 60_000
const MAX_AGE_MS = 300_000

type AutosaveState =
  | { phase: 'idle' }
  | { phase: 'pending' } // change made, timer running
  | { phase: 'saving' }
  | { phase: 'saved'; at: string }
  | { phase: 'error'; message: string }

export function Editor({ ref, filePath, ownerRepoBase, pageSlug }: Props) {
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const file = useQuery({
    queryKey: ['file', ref.owner, ref.repo, ref.branch, filePath],
    queryFn: () => fetchFile(ref, filePath),
  })

  const user = useQuery({
    queryKey: ['authedUser'],
    queryFn: fetchAuthedUser,
    staleTime: Infinity,
  })

  const [dirty, setDirty] = useState(false)
  const [autosave, setAutosave] = useState<AutosaveState>({ phase: 'idle' })
  const [publishState, setPublishState] = useState<
    | { phase: 'idle' }
    | { phase: 'publishing' }
    | { phase: 'done'; result: PublishResult }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' })
  const [uploadCount, setUploadCount] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const initialMarkdownRef = useRef<string>('')
  const [frontmatter, setFrontmatter] = useState<Frontmatter>({})
  const seededRef = useRef(false)

  // Per-page autosave session state (resets on filePath change via useEffect)
  const sessionRef = useRef<AutosaveSession | null>(null)
  const draftBranchRef = useRef<DraftBranchInfo | null>(null)

  // Timer refs
  const draftWriteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const maxAgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlightRef = useRef<Promise<void> | null>(null)

  // Refs let handlePaste/handleDrop call the latest version of these without
  // remounting the editor when user.data resolves or filePath changes.
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)
  const handleImageDropRef = useRef<(files: File[]) => Promise<void>>(async () => {})

  handleImageDropRef.current = async (files: File[]) => {
    if (!user.data) {
      console.warn('[gition] image upload requires sign-in')
      return
    }
    for (const file of files) {
      setUploadCount((n) => n + 1)
      try {
        if (!draftBranchRef.current) {
          draftBranchRef.current = await ensureDraftBranch(
            ref,
            user.data.login,
            ref.branch,
          )
        }
        const { assetPath, relative } = assetPathFor(filePath, file.name)
        const bytes = new Uint8Array(await file.arrayBuffer())
        await uploadAssetToDraftBranch({
          ref,
          branch: draftBranchRef.current.branch,
          path: assetPath,
          bytes,
          message: `gition draft: upload ${file.name}`,
        })
        editorRef.current
          ?.chain()
          .focus()
          .setImage({ src: relative, alt: file.name })
          .run()
      } catch (err) {
        console.error('[gition] image upload failed', err)
      } finally {
        setUploadCount((n) => n - 1)
      }
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      SlashCommand,
      Markdown.configure({
        html: false,
        linkify: true,
        breaks: true,
        tightLists: true,
        transformPastedText: true,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose-gi max-w-none focus:outline-none min-h-[60vh]',
      },
      handlePaste(_view, event) {
        const files = filesFromDataTransfer(event.clipboardData)
        if (files.length === 0) return false
        event.preventDefault()
        void handleImageDropRef.current(files)
        return true
      },
      handleDrop(_view, event) {
        const files = filesFromDataTransfer((event as DragEvent).dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        void handleImageDropRef.current(files)
        return true
      },
    },
    onUpdate({ editor }) {
      setDirty(true)
      setAutosave({ phase: 'pending' })
      const md = (editor as unknown as WithMarkdown).storage.markdown.getMarkdown()
      scheduleDraftWrite(md)
      scheduleAutosave()
    },
  })

  const getMd = useCallback((): string | null => {
    if (!editor) return null
    return (editor as unknown as WithMarkdown).storage.markdown.getMarkdown()
  }, [editor])

  const scheduleDraftWrite = useCallback(
    (md: string) => {
      if (!file.data) return
      if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current)
      draftWriteTimer.current = setTimeout(() => {
        writeDraft(ref, filePath, {
          markdown: md,
          baseSha: file.data!.sha,
          baseContent: initialMarkdownRef.current,
          lastEditedAt: new Date().toISOString(),
        }).catch((err) => console.warn('[gition] draft write failed', err))
      }, 500)
    },
    [file.data, filePath, ref],
  )

  // Commit current editor markdown to the draft branch. Idempotent — fine to
  // call from autosave timer, explicit Save, blur, or unmount.
  const commitDraft = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current
    if (!file.data || !editor || !user.data) return

    const md = getMd()
    if (md === null) return

    // Skip if nothing changed since the last commit. We compare to the
    // last-committed content stored alongside session state.
    if (sessionRef.current?.lastCommitSha) {
      // We don't track exact content per commit; rely on dirty flag instead.
    }
    if (!dirty) return

    const fullContent = serializeWithFrontmatter(md, frontmatter)

    const run = (async () => {
      setAutosave({ phase: 'saving' })
      try {
        if (!draftBranchRef.current) {
          draftBranchRef.current = await ensureDraftBranch(
            ref,
            user.data!.login,
            ref.branch,
          )
        }
        const result = await autosaveToDraftBranch({
          ref,
          branch: draftBranchRef.current.branch,
          path: filePath,
          content: fullContent,
          message: `gition draft: ${displayName(filePath)}`,
          session: sessionRef.current,
        })
        sessionRef.current = result.newSession
        await clearDraft(ref, filePath)
        setDirty(false)
        setAutosave({ phase: 'saved', at: new Date().toISOString() })
        // Reset timers
        if (idleTimer.current) clearTimeout(idleTimer.current)
        if (maxAgeTimer.current) clearTimeout(maxAgeTimer.current)
        idleTimer.current = undefined
        maxAgeTimer.current = undefined
      } catch (err) {
        const message = (err as Error).message
        setAutosave({ phase: 'error', message })
        console.error('[gition] draft commit failed', err)
      }
    })()
    inFlightRef.current = run
    try {
      await run
    } finally {
      inFlightRef.current = null
    }
  }, [editor, file.data, filePath, getMd, ref, user.data, dirty])

  const scheduleAutosave = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      void commitDraft()
    }, IDLE_MS)
    if (!maxAgeTimer.current) {
      maxAgeTimer.current = setTimeout(() => {
        void commitDraft()
      }, MAX_AGE_MS)
    }
  }, [commitDraft])

  // Keep editorRef in sync so the paste/drop handlers can access the editor.
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Seed editor content once file + editor are both ready.
  useEffect(() => {
    if (!editor || !file.data || seededRef.current) return
    seededRef.current = true
    ;(async () => {
      const remote = matter(file.data!.text)
      const body = stripLeadingTitleHeading(remote.content, displayName(filePath))
      setFrontmatter(remote.data as Frontmatter)
      initialMarkdownRef.current = body

      const draft = await readDraft(ref, filePath)
      const md = draft && draft.baseSha === file.data!.sha ? draft.markdown : body
      editor.commands.setContent(md, { emitUpdate: false })
      setDirty(!!draft && draft.markdown !== body)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, file.data])

  // Commit on visibility hidden (tab switch / minimize)
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden' && dirty) {
        void commitDraft()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [commitDraft, dirty])

  // Unmount cleanup — clear timers and best-effort commit on page change
  useEffect(() => {
    return () => {
      if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (maxAgeTimer.current) clearTimeout(maxAgeTimer.current)
      // Reset session for next page
      sessionRef.current = null
    }
  }, [filePath])

  // Save to draft branch only (advanced; doesn't publish to target)
  const onSaveNow = useCallback(() => {
    void commitDraft()
  }, [commitDraft])


  const onExit = useCallback(() => {
    // Exit without saving. Autosave + IndexedDB drafts protect against
    // data loss; the user can come back and Save (which publishes) later.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('edit')
      return next
    })
    navigate(`${ownerRepoBase}${pageSlug ? '/' + pageSlug : ''}`)
  }, [navigate, ownerRepoBase, pageSlug, setSearchParams])

  // "Save" — commits the current state AND publishes (fast-forwards target).
  // For solo users this is what "save" should mean: my changes show up.
  // Internally still routes through the draft branch (squash + recovery).
  const onSave = useCallback(async () => {
    if (!user.data) return
    setPublishState({ phase: 'publishing' })
    try {
      if (dirty) await commitDraft()
      if (!draftBranchRef.current) {
        setPublishState({
          phase: 'done',
          result: { kind: 'nothing-to-publish' },
        })
        return
      }
      const result = await publishDraft({
        ref,
        draftBranch: draftBranchRef.current.branch,
        targetBranch: ref.branch,
        // Use the SHA we know was just written; bypasses GitHub's
        // eventually-consistent /compare and /git/ref reads.
        knownDraftHeadSha: sessionRef.current?.lastCommitSha ?? null,
      })
      if (result.kind === 'fast-forward') {
        try {
          await resetDraftBranchToTarget(
            ref,
            draftBranchRef.current.branch,
            ref.branch,
          )
        } catch (err) {
          console.warn('[gition] draft-branch reset failed (non-fatal)', err)
        }
        // DO NOT clear sessionRef. GitHub's GET /git/ref is eventually
        // consistent right after a force-PATCH; if we set session=null,
        // the next autosave would GET a stale draft HEAD and commit
        // with the wrong parent, causing divergence. Instead, anchor
        // the next session at the freshly-published target HEAD.
        sessionRef.current = {
          rootSha: result.targetHeadSha,
          lastCommitSha: result.targetHeadSha,
        }
      }
      setPublishState({ phase: 'done', result })
      queryClient.invalidateQueries({
        queryKey: ['file', ref.owner, ref.repo, ref.branch, filePath],
      })
      queryClient.invalidateQueries({
        queryKey: ['tree', ref.owner, ref.repo, ref.branch],
      })
    } catch (err) {
      setPublishState({ phase: 'error', message: (err as Error).message })
    }
  }, [commitDraft, dirty, filePath, queryClient, ref, user.data])

  const onDiscard = useCallback(async () => {
    setConfirmDiscard(false)
    setMenuOpen(false)
    try {
      // Clear the local draft so we don't restore it on next open
      await clearDraft(ref, filePath)
      // If a draft branch exists, reset it to the target branch HEAD so the
      // committed-but-unpublished work is also discarded.
      if (draftBranchRef.current) {
        const { resetDraftBranchToTarget } = await import('../lib/draftBranch')
        await resetDraftBranchToTarget(
          ref,
          draftBranchRef.current.branch,
          ref.branch,
        )
      }
    } catch (err) {
      console.warn('[gition] discard cleanup failed', err)
    }
    sessionRef.current = null
    onExit()
  }, [filePath, onExit, ref])

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  // ⌘S / Ctrl+S: trigger Save (commit + publish).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (publishState.phase === 'publishing') return
        void onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave, publishState.phase])

  // Bust file cache when a new commit on the draft branch means we should
  // refresh on next read. (For now, only invalidate when leaving edit mode.)
  useEffect(() => {
    return () => {
      queryClient.invalidateQueries({
        queryKey: ['file', ref.owner, ref.repo, ref.branch, filePath],
      })
    }
  }, [filePath, queryClient, ref])

  if (file.isLoading) return <div className="p-12 text-zinc-500">Loading page…</div>
  if (file.error) {
    return <div className="p-12 text-red-600">Error: {(file.error as Error).message}</div>
  }

  const statusBadge = renderStatusBadge(autosave, dirty)

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between gap-3 px-6 py-3 border-b border-line sticky top-0 bg-paper/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="gi-chip">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Editing
          </span>
          <span className="font-display font-display-sm text-[15px] text-ink truncate">
            {displayName(filePath)}
          </span>
          {statusBadge}
          {uploadCount > 0 && (
            <span className="text-[11px] text-accent">
              uploading {uploadCount} file{uploadCount > 1 ? 's' : ''}…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {publishState.phase === 'error' && (
            <span
              className="text-[11px] text-red-600 max-w-xs truncate"
              title={publishState.message}
            >
              save failed
            </span>
          )}
          {publishState.phase === 'done' &&
            publishState.result.kind === 'pr-opened' && (
              <a
                href={publishState.result.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-accent hover:underline"
              >
                PR #{publishState.result.number} opened
              </a>
            )}
          {publishState.phase === 'done' &&
            publishState.result.kind === 'fast-forward' && (
              <span className="text-[11px] text-emerald-600">Saved ✓</span>
            )}
          {publishState.phase === 'done' &&
            publishState.result.kind === 'nothing-to-publish' && (
              <span className="text-[11px] text-muted">No changes</span>
            )}
          <button
            onClick={onSave}
            disabled={publishState.phase === 'publishing' || !dirty}
            className="gi-button gi-button-accent"
            title="Save changes and publish (⌘S)"
          >
            {publishState.phase === 'publishing' ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onExit}
            className="gi-button gi-button-quiet"
            title="Leave edit mode. Click Save first to publish your changes."
          >
            Exit
          </button>
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="gi-button gi-button-quiet !px-2"
              title="More"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="3" cy="8" r="1.4" />
                <circle cx="8" cy="8" r="1.4" />
                <circle cx="13" cy="8" r="1.4" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 gi-floating w-64 py-1">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted">
                  Advanced
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    void onSaveNow()
                  }}
                  disabled={autosave.phase === 'saving' || !dirty}
                  className="w-full text-left px-3 py-2 text-[13px] text-ink-2 hover:text-ink hover:bg-paper-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  title="Commits to your private draft branch without publishing to the wiki"
                >
                  Save to draft branch only
                  <span className="block text-[10px] text-muted mt-0.5">
                    Stage without publishing
                  </span>
                </button>
                <div className="my-1 h-px bg-line" />
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirmDiscard(true)
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                >
                  Discard changes…
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-14 py-14 relative gi-fade-in">
          <FrontmatterControls
            frontmatter={frontmatter}
            fallbackTitle={displayName(filePath)}
            onChange={(next) => {
              setFrontmatter(next)
              setDirty(true)
              setAutosave({ phase: 'pending' })
            }}
          />
          <EditorContent editor={editor} />
          <EditorBubbleMenu editor={editor} />
          <TableMenu editor={editor} />
        </div>
      </div>
      {confirmDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          body="Your unpublished edits will be removed. This clears both the local draft and the draft branch on GitHub."
          confirmLabel="Discard"
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onDiscard}
        />
      )}
    </div>
  )
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 gi-modal-backdrop flex items-center justify-center px-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm gi-floating p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[18px] text-ink mb-2">{title}</h3>
        <p className="text-[13px] text-ink-2 mb-5 leading-relaxed">{body}</p>
        <div className="flex gap-2 justify-end">
          <button className="gi-button gi-button-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={
              danger
                ? 'gi-button gi-button-primary !bg-red-600 hover:!bg-red-500'
                : 'gi-button gi-button-accent'
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function renderStatusBadge(state: AutosaveState, dirty: boolean) {
  if (state.phase === 'pending')
    return <span className="text-[11px] text-accent">· unsaved</span>
  if (state.phase === 'saving')
    return <span className="text-[11px] text-accent">· saving…</span>
  if (state.phase === 'saved' && !dirty)
    return <span className="text-[11px] text-emerald-600">· saved to draft</span>
  if (state.phase === 'error')
    return (
      <span className="text-[11px] text-red-600 max-w-xs truncate" title={state.message}>
        · save error
      </span>
    )
  return null
}

function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const out: File[] = []
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i]
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) out.push(f)
    }
  }
  return out
}

// Asset path convention: <page-without-md>.assets/<slug>-<timestamp>.<ext>
// The relative markdown reference resolves from the page's containing folder.
function assetPathFor(
  pagePath: string,
  filename: string,
): { assetPath: string; relative: string } {
  const folder = pagePath.replace(/\.md$/i, '.assets')
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''
  const safeStem = slugify(stem) || 'asset'
  const stamped = `${safeStem}-${Date.now()}${ext.toLowerCase()}`
  const assetPath = `${folder}/${stamped}`
  const pageFolder = pagePath.includes('/')
    ? pagePath.slice(0, pagePath.lastIndexOf('/'))
    : ''
  const relative = pageFolder
    ? './' + assetPath.slice(pageFolder.length + 1)
    : './' + assetPath
  return { assetPath, relative }
}

function serializeWithFrontmatter(
  body: string,
  frontmatter: Frontmatter,
): string {
  const keys = Object.keys(frontmatter)
  if (keys.length === 0) return body
  return matter.stringify(body, frontmatter)
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
