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
    <div className="mb-10">
      <div className="flex items-start gap-4">
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
            className="font-display w-full text-[34px] sm:text-[42px] lg:text-[52px] leading-[1.05] text-ink bg-transparent outline-none placeholder:text-hush"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-muted">
        <label className="inline-flex items-center gap-2 cursor-pointer hover:text-ink-2 transition">
          <input
            type="checkbox"
            checked={draftVal}
            onChange={(e) => set('draft', e.target.checked || undefined)}
            className="w-3.5 h-3.5 rounded-sm accent-accent"
            style={{ accentColor: 'var(--accent)' }}
          />
          Hide from sidebar (draft)
        </label>
        {titleVal && titleVal !== fallbackTitle && (
          <button
            onClick={() => set('title', undefined)}
            className="hover:text-ink transition"
          >
            Reset title
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
          'shrink-0 flex items-center justify-center transition rounded-md',
          value
            ? 'w-[52px] h-[52px] sm:w-[68px] sm:h-[68px] text-[44px] sm:text-[56px] leading-none hover:bg-paper-2 -ml-1'
            : 'h-7 px-2.5 text-xs text-muted hover:text-ink hover:bg-paper-2 mt-2 sm:mt-3 border border-line gap-1.5',
        )}
      >
        {value || (
          <>
            <span>＋</span>
            <span>Add icon</span>
          </>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-80 p-4 gi-floating">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type an emoji or paste one"
            className="gi-input w-full mb-3"
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
                className="w-9 h-9 flex items-center justify-center text-xl hover:bg-paper-2 rounded-md transition"
              >
                {emoji}
              </button>
            ))}
          </div>
          {value && (
            <button
              onClick={() => onPick('')}
              className="mt-3 text-xs text-muted hover:text-ink transition"
            >
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  )
}
