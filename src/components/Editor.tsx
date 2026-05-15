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
import matter from 'gray-matter'
import {
  fetchFile,
  fetchAuthedUser,
  type RepoRef,
} from '../lib/github'
import {
  autosaveToDraftBranch,
  ensureDraftBranch,
  publishDraft,
  resetDraftBranchToTarget,
  type AutosaveSession,
  type DraftBranchInfo,
} from '../lib/draftBranch'
import { readDraft, writeDraft, clearDraft } from '../lib/drafts'
import { displayName, slugify } from '../lib/slug'
import { uploadAssetToDraftBranch } from '../lib/draftBranch'
import { TableMenu } from './TableMenu'
import { EditorBubbleMenu } from './EditorBubbleMenu'
import { SlashCommand } from './SlashMenu'
import { FrontmatterControls, type Frontmatter } from './FrontmatterControls'

type WithMarkdown = {
  storage: { markdown: { getMarkdown: () => string } }
}

type Props = {
  ref: RepoRef
  // Optional: read initial content from a different branch (e.g. user's
  // draft branch) than the one we save to.
  sourceRef?: RepoRef
  filePath: string
  ownerRepoBase: string
  pageSlug: string
}

// Autosave triggers — IndexedDB always on every keystroke (debounced 500ms).
// Remote save fires on: explicit Save, blur, navigate, idle MAX_AGE.
const MAX_AGE_MS = 5 * 60 * 1000

type SaveStatus =
  | { phase: 'clean' } // saved & no edits
  | { phase: 'dirty' } // edits present, not yet sent
  | { phase: 'saving' }
  | { phase: 'saved'; at: Date }
  | { phase: 'pr'; url: string; number: number }
  | { phase: 'error'; message: string }

export function Editor({ ref, sourceRef, filePath, ownerRepoBase, pageSlug }: Props) {
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const readRef = sourceRef ?? ref

  const file = useQuery({
    queryKey: ['file', readRef.owner, readRef.repo, readRef.branch, filePath],
    queryFn: () => fetchFile(readRef, filePath),
  })

  const user = useQuery({
    queryKey: ['authedUser'],
    queryFn: fetchAuthedUser,
    staleTime: Infinity,
  })

  const [status, setStatus] = useState<SaveStatus>({ phase: 'clean' })
  const [frontmatter, setFrontmatter] = useState<Frontmatter>({})
  const [uploadCount, setUploadCount] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const initialMarkdownRef = useRef<string>('')
  const seededRef = useRef(false)
  const dirtyRef = useRef(false)
  const fileShaRef = useRef<string | null>(null)
  const draftBranchRef = useRef<DraftBranchInfo | null>(null)
  const sessionRef = useRef<AutosaveSession | null>(null)

  const draftWriteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const maxAgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlightRef = useRef<Promise<void> | null>(null)

  // Refs let editor's editorProps closures call latest versions
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)
  const handleImageDropRef = useRef<(files: File[]) => Promise<void>>(async () => {})

  handleImageDropRef.current = async (files: File[]) => {
    if (!user.data) return
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
          message: `gition: upload ${file.name}`,
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
      dirtyRef.current = true
      setStatus({ phase: 'dirty' })
      const md = (editor as unknown as WithMarkdown).storage.markdown.getMarkdown()
      scheduleDraftWrite(md)
      scheduleMaxAgeSave()
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const getMd = useCallback((): string | null => {
    if (!editor) return null
    return (editor as unknown as WithMarkdown).storage.markdown.getMarkdown()
  }, [editor])

  const scheduleDraftWrite = useCallback(
    (md: string) => {
      if (fileShaRef.current === null) return
      if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current)
      draftWriteTimer.current = setTimeout(() => {
        writeDraft(ref, filePath, {
          markdown: md,
          baseSha: fileShaRef.current!,
          baseContent: initialMarkdownRef.current,
          lastEditedAt: new Date().toISOString(),
        }).catch((err) => console.warn('[gition] draft write failed', err))
      }, 500)
    },
    [filePath, ref],
  )

  // Unified save flow: stage on user's draft branch (which collapses with
  // session squash), then fast-forward target from there. If FF isn't
  // allowed (protection / divergence), publishDraft falls back to a PR.
  // For the common solo-user case this is two extra API calls vs a raw
  // PUT — acceptable trade for handling all branching cleanly.
  const save = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current
    if (!editor || !user.data || fileShaRef.current === null) return
    if (!dirtyRef.current) return

    const md = getMd()
    if (md === null) return

    const run = (async () => {
      setStatus({ phase: 'saving' })
      const full = serializeWithFrontmatter(md, frontmatter)
      try {
        if (!draftBranchRef.current) {
          draftBranchRef.current = await ensureDraftBranch(
            ref,
            user.data!.login,
            ref.branch,
          )
        }
        const upload = await autosaveToDraftBranch({
          ref,
          branch: draftBranchRef.current.branch,
          path: filePath,
          content: full,
          message: `gition: update ${displayName(filePath)}`,
          session: sessionRef.current,
        })
        sessionRef.current = upload.newSession
        const result = await publishDraft({
          ref,
          draftBranch: draftBranchRef.current.branch,
          targetBranch: ref.branch,
          knownDraftHeadSha: upload.newCommitSha,
        })
        if (result.kind === 'fast-forward') {
          try {
            await resetDraftBranchToTarget(
              ref,
              draftBranchRef.current.branch,
              ref.branch,
            )
          } catch {
            // non-fatal
          }
          // Anchor next session at the published HEAD so subsequent autosaves
          // parent correctly without relying on the eventually-consistent
          // GET /git/ref read.
          sessionRef.current = {
            rootSha: result.targetHeadSha,
            lastCommitSha: result.targetHeadSha,
          }
          fileShaRef.current = null // force the next save to re-resolve SHA
          dirtyRef.current = false
          await clearDraft(ref, filePath)
          setStatus({ phase: 'saved', at: new Date() })
          if (maxAgeTimer.current) clearTimeout(maxAgeTimer.current)
          maxAgeTimer.current = undefined
          // Invalidate file cache so future loads see fresh content + SHA
          queryClient.invalidateQueries({
            queryKey: ['file', ref.owner, ref.repo, ref.branch, filePath],
          })
          // Also invalidate user-unpublished state so it clears if this was
          // the last unpublished file
          queryClient.invalidateQueries({
            queryKey: ['unpublished', ref.owner, ref.repo, ref.branch],
          })
        } else if (result.kind === 'pr-opened') {
          dirtyRef.current = false
          await clearDraft(ref, filePath)
          setStatus({
            phase: 'pr',
            url: result.url,
            number: result.number,
          })
          if (maxAgeTimer.current) clearTimeout(maxAgeTimer.current)
          maxAgeTimer.current = undefined
        } else {
          // nothing-to-publish — shouldn't happen since we just wrote
          setStatus({ phase: 'saved', at: new Date() })
        }
      } catch (err) {
        setStatus({ phase: 'error', message: (err as Error).message })
      }
    })()
    inFlightRef.current = run
    try {
      await run
    } finally {
      inFlightRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, filePath, frontmatter, getMd, queryClient, ref, user.data])

  const scheduleMaxAgeSave = useCallback(() => {
    if (maxAgeTimer.current) return // already scheduled
    maxAgeTimer.current = setTimeout(() => {
      void save()
    }, MAX_AGE_MS)
  }, [save])

  // Seed editor once when file + editor are both ready.
  useEffect(() => {
    if (!editor || !file.data || seededRef.current) return
    seededRef.current = true
    ;(async () => {
      const remote = matter(file.data!.text)
      const body = stripLeadingTitleHeading(remote.content, displayName(filePath))
      setFrontmatter(remote.data as Frontmatter)
      initialMarkdownRef.current = body
      fileShaRef.current = file.data!.sha

      const draft = await readDraft(ref, filePath)
      const md = draft && draft.baseSha === file.data!.sha ? draft.markdown : body
      editor.commands.setContent(md, { emitUpdate: false })
      const hasDraft = !!draft && draft.markdown !== body
      dirtyRef.current = hasDraft
      setStatus({ phase: hasDraft ? 'dirty' : 'clean' })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, file.data])

  // Save on tab hidden, since we won't get a reliable beforeunload
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden' && dirtyRef.current) {
        void save()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [save])

  useEffect(() => {
    return () => {
      if (draftWriteTimer.current) clearTimeout(draftWriteTimer.current)
      if (maxAgeTimer.current) clearTimeout(maxAgeTimer.current)
    }
  }, [filePath])

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  // ⌘S / Ctrl+S triggers Save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  const onExit = useCallback(async () => {
    // Best-effort save on exit if dirty; never block
    if (dirtyRef.current) {
      try {
        await save()
      } catch {
        // ignore
      }
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('edit')
      return next
    })
    navigate(`${ownerRepoBase}${pageSlug ? '/' + pageSlug : ''}`)
  }, [navigate, ownerRepoBase, pageSlug, save, setSearchParams])

  const onDiscard = useCallback(async () => {
    setConfirmDiscard(false)
    setMenuOpen(false)
    try {
      await clearDraft(ref, filePath)
      if (draftBranchRef.current) {
        await resetDraftBranchToTarget(
          ref,
          draftBranchRef.current.branch,
          ref.branch,
        )
      }
    } catch (err) {
      console.warn('[gition] discard cleanup failed', err)
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('edit')
      return next
    })
    navigate(`${ownerRepoBase}${pageSlug ? '/' + pageSlug : ''}`)
  }, [filePath, navigate, ownerRepoBase, pageSlug, ref, setSearchParams])

  if (file.isLoading) return <div className="p-12 text-muted text-sm">Loading page…</div>
  if (file.error) {
    return <div className="p-12 text-red-600 text-sm">Error: {(file.error as Error).message}</div>
  }

  const statusPill = renderStatusPill(status, uploadCount)

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
          {statusPill}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={status.phase === 'saving' || status.phase === 'clean'}
            className="gi-button gi-button-accent"
            title="Save changes (⌘S)"
          >
            {status.phase === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onExit}
            className="gi-button gi-button-quiet"
            title="Leave edit mode (auto-saves if dirty)"
          >
            Done
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
              <div className="absolute right-0 top-full mt-1 z-30 gi-floating w-56 py-1">
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
              dirtyRef.current = true
              setStatus({ phase: 'dirty' })
              scheduleMaxAgeSave()
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
          body="Your unsaved edits will be removed. This clears the local draft and resets any in-progress branch back to the target."
          confirmLabel="Discard"
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onDiscard}
        />
      )}
    </div>
  )
}

function renderStatusPill(status: SaveStatus, uploadCount: number) {
  if (uploadCount > 0) {
    return (
      <span className="text-[11px] text-accent">
        Uploading {uploadCount}…
      </span>
    )
  }
  switch (status.phase) {
    case 'clean':
      return null
    case 'dirty':
      return <span className="text-[11px] text-muted">Unsaved</span>
    case 'saving':
      return <span className="text-[11px] text-accent">Saving…</span>
    case 'saved':
      return (
        <span className="text-[11px] text-emerald-600">
          Saved · {formatTime(status.at)}
        </span>
      )
    case 'pr':
      return (
        <a
          href={status.url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-accent hover:underline"
          title="Direct push wasn't allowed (branch protection or no write access)"
        >
          PR #{status.number} opened — review required
        </a>
      )
    case 'error':
      return (
        <span
          className="text-[11px] text-red-600 max-w-xs truncate"
          title={status.message}
        >
          Save failed
        </span>
      )
  }
}

function formatTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
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
