import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

export type Frontmatter = Record<string, unknown>

type Props = {
  frontmatter: Frontmatter
  fallbackTitle: string
  onChange: (next: Frontmatter) => void
}

export function FrontmatterControls({ frontmatter, fallbackTitle, onChange }: Props) {
  const [iconOpen, setIconOpen] = useState(false)
  const titleVal = typeof frontmatter.title === 'string' ? frontmatter.title : ''
  const iconVal = typeof frontmatter.icon === 'string' ? frontmatter.icon : ''
  const draftVal = frontmatter.draft === true

  function set(key: string, value: unknown) {
    const next: Frontmatter = { ...frontmatter }
    if (value === '' || value === undefined || value === null || value === false) {
      delete next[key]
    } else {
      next[key] = value
    }
    onChange(next)
  }

  return (
    <div className="mb-8">
      <div className="flex items-start gap-3">
        <IconPicker
          value={iconVal}
          open={iconOpen}
          onOpenChange={setIconOpen}
          onPick={(emoji) => {
            set('icon', emoji)
            setIconOpen(false)
          }}
        />
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={titleVal}
            onChange={(e) => set('title', e.target.value)}
            placeholder={fallbackTitle}
            className="w-full text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 bg-transparent outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={draftVal}
            onChange={(e) => set('draft', e.target.checked || undefined)}
            className="rounded accent-violet-600"
          />
          Hide from sidebar (draft)
        </label>
        {titleVal && titleVal !== fallbackTitle && (
          <button
            onClick={() => set('title', undefined)}
            className="hover:text-zinc-900 dark:hover:text-zinc-200 transition"
          >
            Reset title to filename
          </button>
        )}
      </div>
    </div>
  )
}

function IconPicker({
  value,
  open,
  onOpenChange,
  onPick,
}: {
  value: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onPick: (emoji: string) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState(value)

  useEffect(() => {
    if (open) setInput(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open, onOpenChange])

  const presets = [
    '📄', '📝', '📓', '📚', '📖', '✏️', '✅', '🚀',
    '💡', '🌟', '🔥', '⚡', '🎯', '🧠', '💬', '📊',
    '🍸', '🍹', '🍷', '🍺', '🥃', '☕', '🍴', '🍽️',
    '✈️', '🚗', '🏠', '🌆', '🌍', '⭐', '🎵', '🎬',
  ]

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        className={clsx(
          'shrink-0 flex items-center justify-center transition',
          value
            ? 'w-14 h-14 text-5xl hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded'
            : 'h-7 px-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 mt-2',
        )}
      >
        {value || '+ Add icon'}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-72 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type an emoji or paste one"
            className="w-full mb-3 px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800 outline-none text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input.trim()) {
                onPick(input.trim())
              }
            }}
          />
          <div className="grid grid-cols-8 gap-1">
            {presets.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onPick(emoji)}
                className="w-8 h-8 flex items-center justify-center text-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
              >
                {emoji}
              </button>
            ))}
          </div>
          {value && (
            <button
              onClick={() => onPick('')}
              className="mt-3 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  )
}
