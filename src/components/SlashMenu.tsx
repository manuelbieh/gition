import { useEffect, useImperativeHandle, useState, forwardRef } from 'react'
import { Extension, ReactRenderer, type Editor, type Range } from '@tiptap/react'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import tippy, { type Instance } from 'tippy.js'

export type SlashItem = {
  title: string
  hint: string
  search: string[]
  icon: React.ReactNode
  command: (args: { editor: Editor; range: Range }) => void
}

const ITEMS: SlashItem[] = [
  {
    title: 'Text',
    hint: 'Plain paragraph',
    search: ['text', 'paragraph', 'p'],
    icon: <Glyph>¶</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    hint: 'Big section heading',
    search: ['heading', 'h1', 'title'],
    icon: <Glyph className="font-display">H₁</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    hint: 'Medium section heading',
    search: ['heading', 'h2'],
    icon: <Glyph className="font-display">H₂</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    hint: 'Small section heading',
    search: ['heading', 'h3'],
    icon: <Glyph className="font-display">H₃</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    hint: 'Simple bulleted list',
    search: ['bullet', 'list', 'unordered'],
    icon: <Glyph>•</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    hint: 'Ordered list',
    search: ['numbered', 'ordered', 'list', '1.'],
    icon: <Glyph>1.</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'To-do list',
    hint: 'Checkbox list',
    search: ['todo', 'task', 'checkbox'],
    icon: <Glyph>☐</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Quote',
    hint: 'Block quote',
    search: ['quote', 'blockquote'],
    icon: <Glyph>"</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    hint: 'Fenced code with mono font',
    search: ['code', 'pre', 'fenced'],
    icon: <Glyph className="font-mono text-[11px]">{'{}'}</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    hint: 'Horizontal rule',
    search: ['divider', 'separator', 'hr', 'line'],
    icon: <Glyph>—</Glyph>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Table',
    hint: '3x3 markdown table',
    search: ['table', 'grid'],
    icon: <Glyph>⊞</Glyph>,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
]

function Glyph({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`w-8 h-8 flex items-center justify-center rounded-md bg-paper-2 border border-line text-ink-2 text-sm shrink-0 ${className ?? ''}`}
    >
      {children}
    </span>
  )
}

type SlashListProps = {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

type SlashListHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean
}

const SlashList = forwardRef<SlashListHandle, SlashListProps>(({ items, command }, ref) => {
  const [active, setActive] = useState(0)

  useEffect(() => {
    setActive(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowDown') {
        setActive((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setActive((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        if (items[active]) command(items[active])
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return (
      <div className="gi-floating p-3 text-xs text-muted w-[260px]">
        No matching blocks.
      </div>
    )
  }

  return (
    <div className="gi-floating py-1.5 w-[280px] max-h-[320px] overflow-y-auto">
      {items.map((item, i) => (
        <button
          key={item.title}
          onMouseEnter={() => setActive(i)}
          onClick={() => command(item)}
          className={`w-full text-left flex items-center gap-3 px-2.5 py-1.5 transition ${
            i === active ? 'bg-accent-soft' : 'hover:bg-paper-2'
          }`}
        >
          {item.icon}
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-medium text-ink">
              {item.title}
            </span>
            <span className="block text-[11px] text-muted truncate">
              {item.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
})
SlashList.displayName = 'SlashList'

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range })
        },
      } as Partial<SuggestionOptions<SlashItem>>,
    }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          if (!query) return ITEMS
          const q = query.toLowerCase()
          return ITEMS.filter(
            (item: SlashItem) =>
              item.search.some((kw: string) => kw.toLowerCase().startsWith(q)) ||
              item.title.toLowerCase().includes(q),
          )
        },
        render: () => {
          let renderer: ReactRenderer<SlashListHandle, SlashListProps> | null = null
          let popup: Instance[] = []
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashList, {
                props: {
                  items: props.items as SlashItem[],
                  command: (item: SlashItem) => props.command(item),
                },
                editor: props.editor,
              })
              if (!props.clientRect) return
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: renderer.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                offset: [0, 6],
                animation: false,
                theme: 'gition',
              })
            },
            onUpdate: (props) => {
              renderer?.updateProps({
                items: props.items as SlashItem[],
                command: (item: SlashItem) => props.command(item),
              })
              if (!props.clientRect) return
              popup[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              })
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup[0]?.hide()
                return true
              }
              return renderer?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              popup[0]?.destroy()
              renderer?.destroy()
              renderer = null
              popup = []
            },
          }
        },
      }),
    ]
  },
})
