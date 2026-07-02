import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { relativeTime } from '~/lib/dates'
import { cn } from '~/lib/utils'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'

const QUICK_NOTE_TITLE = '__today_quick_note__'

export const Route = createFileRoute('/_authenticated/notes')({
  component: NotesPage,
})

function ProjectTag({ color, label }: { color: string; label: string }) {
  return (
    <Badge
      className="rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold"
      style={
        {
          color,
          backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        }
      }
    >
      {label}
    </Badge>
  )
}

function StandaloneTag() {
  return (
    <Badge className="rounded-full border-0 bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      Standalone
    </Badge>
  )
}

function NotesPage() {
  const { data: notes } = useSuspenseQuery(convexQuery(api.notes.list, {}))
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const createNote = useMutation(api.notes.create)
  const updateNote = useMutation(api.notes.update)
  const removeNote = useMutation(api.notes.remove)

  const visibleNotes = useMemo(
    () => notes.filter((note) => note.title !== QUICK_NOTE_TITLE),
    [notes],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredNotes = visibleNotes.filter((note) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      note.title.toLowerCase().includes(q) || note.body.toLowerCase().includes(q)
    )
  })

  const activeNote = filteredNotes.find((note) => note._id === selectedId)
  const activeProjectColor =
    projects.find((p) => p._id === activeNote?.projectId)?.color ?? '#6366f1'
  const activeProjectName = projects.find(
    (p) => p._id === activeNote?.projectId,
  )?.name

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visibleNotes.length} notes
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            void createNote({ title: 'Untitled note', body: '' }).then((id) =>
              setSelectedId(id),
            )
          }}
        >
          + New note
        </Button>
      </header>

      <div className="grid h-[calc(100vh-170px)] grid-cols-1 gap-5 md:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-2 overflow-y-auto">
          <Input
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filteredNotes.map((note) => {
            const project = projects.find((p) => p._id === note.projectId)
            return (
              <button
                key={note._id}
                type="button"
                className={cn(
                  'w-full rounded-md border bg-card p-3 text-left shadow-soft transition-colors',
                  selectedId === note._id
                    ? 'border-primary ring-2 ring-primary/10'
                    : 'border-border',
                )}
                onClick={() => setSelectedId(note._id)}
              >
                <div className="mb-0.5 text-sm font-semibold">{note.title}</div>
                <div className="mb-2 truncate text-[13px] text-muted-foreground">
                  {note.body.slice(0, 80) || 'Empty note'}
                </div>
                {project ? (
                  <ProjectTag color={project.color} label={project.name} />
                ) : (
                  <StandaloneTag />
                )}
              </button>
            )
          })}
        </aside>

        {activeNote ? (
          <section className="overflow-y-auto rounded-xl border border-border bg-card p-8 shadow-soft">
            <input
              className="mb-2.5 w-full border-none bg-transparent text-2xl font-bold outline-none"
              value={activeNote.title}
              onChange={(e) =>
                void updateNote({ noteId: activeNote._id, title: e.target.value })
              }
            />
            <div className="mb-6 flex items-center gap-3 text-[13px]">
              {activeNote.projectId ? (
                <ProjectTag
                  color={activeProjectColor}
                  label={activeProjectName ?? ''}
                />
              ) : (
                <StandaloneTag />
              )}
              <span className="text-muted-foreground">
                Edited {relativeTime(activeNote.updatedAt)}
              </span>
              <Button
                type="button"
                variant="outline"
                className="ml-auto"
                onClick={() => void removeNote({ noteId: activeNote._id })}
              >
                Delete
              </Button>
            </div>
            <textarea
              className="min-h-[360px] w-full resize-y border-none bg-transparent text-[15px] leading-7 text-foreground outline-none"
              value={activeNote.body}
              onChange={(e) =>
                void updateNote({ noteId: activeNote._id, body: e.target.value })
              }
            />
          </section>
        ) : (
          <section className="overflow-y-auto rounded-xl border border-border bg-card p-8 shadow-soft">
            <p className="text-muted-foreground">Select or create a note.</p>
          </section>
        )}
      </div>
    </section>
  )
}
