import { useState, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import clsx from 'clsx'

type Props = {
  editor: Editor | null
}

export function EditorBubbleMenu({ editor }: Props) {
  const [linkMode, setLinkMode] = useState<null | { url: string }>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (linkMode && linkInputRef.current) linkInputRef.current.focus()
  }, [linkMode])

  if (!editor) return null

  function openLinkMode() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    setLinkMode({ url: prev ?? '' })
  }

  function applyLink(href: string) {
    if (!editor) return
    const trimmed = href.trim()
    const chain = editor.chain().focus()
    if (!trimmed) {
      chain.extendMarkRange('link').unsetLink().run()
    } else {
      chain
        .extendMarkRange('link')
        .setLink({ href: trimmed.startsWith('http') || trimmed.startsWith('/') ? trimmed : `https://${trimmed}` })
        .run()
    }
    setLinkMode(null)
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: 'top',
        offset: 8,
      }}
      shouldShow={({ editor, from, to }) => {
        if (from === to) return false
        if (editor.isActive('image')) return false
        return true
      }}
    >
      <div className="gi-floating flex items-center gap-0.5 p-1">
        {linkMode ? (
          <div className="flex items-center gap-1 px-1">
            <input
              ref={linkInputRef}
              type="text"
              defaultValue={linkMode.url}
              placeholder="Paste link or URL"
              className="gi-input !py-1 !px-2 !text-[12px] w-64"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyLink((e.target as HTMLInputElement).value)
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setLinkMode(null)
                }
              }}
            />
            <button
              className="gi-button gi-button-quiet !py-1 !px-2 !text-[12px]"
              onClick={() => setLinkMode(null)}
              type="button"
            >
              Cancel
            </button>
            {linkMode.url && (
              <button
                className="gi-button gi-button-quiet !py-1 !px-2 !text-[12px] text-red-600"
                onClick={() => applyLink('')}
                type="button"
              >
                Unlink
              </button>
            )}
          </div>
        ) : (
          <>
            <BlockSelect editor={editor} />
            <Divider />
            <Btn
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Bold (⌘B)"
            >
              <span className="font-semibold">B</span>
            </Btn>
            <Btn
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Italic (⌘I)"
            >
              <span className="italic font-display-italic">I</span>
            </Btn>
            <Btn
              active={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title="Underline (⌘U)"
            >
              <span className="underline">U</span>
            </Btn>
            <Btn
              active={editor.isActive('strike')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="Strikethrough"
            >
              <span className="line-through">S</span>
            </Btn>
            <Btn
              active={editor.isActive('code')}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="Inline code"
            >
              <span className="font-mono">{'<>'}</span>
            </Btn>
            <Divider />
            <Btn
              active={editor.isActive('link')}
              onClick={openLinkMode}
              title="Link (⌘K)"
            >
              <LinkIcon />
            </Btn>
            <Divider />
            <Btn
              active={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet list"
            >
              <BulletIcon />
            </Btn>
            <Btn
              active={editor.isActive('orderedList')}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Numbered list"
            >
              <NumberedIcon />
            </Btn>
            <Btn
              active={editor.isActive('taskList')}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              title="Task list"
            >
              <TaskIcon />
            </Btn>
            <Btn
              active={editor.isActive('blockquote')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="Quote"
            >
              <QuoteIcon />
            </Btn>
          </>
        )}
      </div>
    </BubbleMenu>
  )
}

function BlockSelect({ editor }: { editor: Editor }) {
  let current = 'Text'
  if (editor.isActive('heading', { level: 1 })) current = 'Heading 1'
  else if (editor.isActive('heading', { level: 2 })) current = 'Heading 2'
  else if (editor.isActive('heading', { level: 3 })) current = 'Heading 3'
  else if (editor.isActive('codeBlock')) current = 'Code'

  return (
    <div className="relative group">
      <button className="gi-button gi-button-quiet !py-1 !px-2 !text-[12px]">
        {current}
        <svg width="8" height="8" viewBox="0 0 10 10" className="ml-0.5">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="absolute left-0 top-full mt-1 hidden group-hover:block group-focus-within:block z-50 gi-floating py-1 min-w-[140px]">
        <Opt onClick={() => editor.chain().focus().setParagraph().run()}>Text</Opt>
        <Opt onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <span className="font-display text-[15px]">Heading 1</span>
        </Opt>
        <Opt onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <span className="font-display text-[14px]">Heading 2</span>
        </Opt>
        <Opt onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <span className="font-display text-[13px]">Heading 3</span>
        </Opt>
        <Opt onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <span className="font-mono text-xs">Code block</span>
        </Opt>
      </div>
    </div>
  )
}

function Opt({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-[12.5px] text-ink-2 hover:text-ink hover:bg-paper-2 transition"
    >
      {children}
    </button>
  )
}

function Btn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        'w-7 h-7 flex items-center justify-center rounded text-[12.5px] transition',
        active
          ? 'bg-accent-soft text-accent-ink'
          : 'text-ink-2 hover:bg-paper-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="w-px h-4 bg-line mx-0.5" />
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 10.5H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1zM9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6.5h3a2 2 0 1 1 0 4h-1.535a4.02 4.02 0 0 1-.82 1H12a3 3 0 1 0 0-6H9z" />
    </svg>
  )
}

function BulletIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="4" r="1" />
      <circle cx="3" cy="8" r="1" />
      <circle cx="3" cy="12" r="1" />
      <rect x="6" y="3.4" width="8" height="1.2" rx="0.6" />
      <rect x="6" y="7.4" width="8" height="1.2" rx="0.6" />
      <rect x="6" y="11.4" width="8" height="1.2" rx="0.6" />
    </svg>
  )
}

function NumberedIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <text x="0" y="6" fontSize="5" fontFamily="ui-monospace, monospace">1.</text>
      <text x="0" y="11" fontSize="5" fontFamily="ui-monospace, monospace">2.</text>
      <rect x="6" y="3.4" width="8" height="1.2" rx="0.6" />
      <rect x="6" y="7.4" width="8" height="1.2" rx="0.6" />
      <rect x="6" y="11.4" width="8" height="1.2" rx="0.6" />
    </svg>
  )
}

function TaskIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1.5" y="2.5" width="3.5" height="3.5" rx="0.5" fill="none" stroke="currentColor" />
      <rect x="1.5" y="9.5" width="3.5" height="3.5" rx="0.5" fill="none" stroke="currentColor" />
      <path d="M2.5 4.5l1 1L4.5 4" stroke="currentColor" fill="none" />
      <rect x="6.5" y="3.4" width="8" height="1.2" rx="0.6" />
      <rect x="6.5" y="10.4" width="8" height="1.2" rx="0.6" />
    </svg>
  )
}

function QuoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 4h2v3a3 3 0 0 1-3 3v-1.5a1.5 1.5 0 0 0 1.5-1.5H3V4zm6 0h2v3a3 3 0 0 1-3 3v-1.5a1.5 1.5 0 0 0 1.5-1.5H9V4z" />
    </svg>
  )
}
