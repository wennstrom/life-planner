import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { relativeTime } from '~/lib/dates'

const QUICK_NOTE_TITLE = '__today_quick_note__'

export const Route = createFileRoute('/_authenticated/notes')({
  component: NotesPage,
})

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

  return (
    <section className="view active">
      <header className="view-header">
        <div>
          <h1>Notes</h1>
          <p className="view-sub">{visibleNotes.length} notes</p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              void createNote({ title: 'Untitled note', body: '' }).then((id) =>
                setSelectedId(id),
              )
            }}
          >
            + New note
          </button>
        </div>
      </header>

      <div className="notes-layout">
        <aside className="notes-list">
          <input
            className="search"
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
                className={`note-item${selectedId === note._id ? ' active' : ''}`}
                onClick={() => setSelectedId(note._id)}
                style={{ width: '100%', textAlign: 'left' }}
              >
                <div className="note-item-title">{note.title}</div>
                <div className="note-item-prev">{note.body.slice(0, 80) || 'Empty note'}</div>
                {project ? (
                  <span
                    className="note-item-tag"
                    style={{ ['--tag' as string]: project.color }}
                  >
                    {project.name}
                  </span>
                ) : (
                  <span className="note-item-tag standalone">Standalone</span>
                )}
              </button>
            )
          })}
        </aside>

        {activeNote ? (
          <section className="note-editor">
            <input
              className="note-title-input"
              value={activeNote.title}
              onChange={(e) =>
                void updateNote({ noteId: activeNote._id, title: e.target.value })
              }
            />
            <div className="note-editor-meta">
              {activeNote.projectId ? (
                <span
                  className="note-item-tag"
                  style={{
                    ['--tag' as string]:
                      projects.find((p) => p._id === activeNote.projectId)?.color ??
                      '#6366f1',
                  }}
                >
                  {projects.find((p) => p._id === activeNote.projectId)?.name}
                </span>
              ) : (
                <span className="note-item-tag standalone">Standalone</span>
              )}
              <span className="muted">Edited {relativeTime(activeNote.updatedAt)}</span>
              <button
                type="button"
                className="btn ghost"
                style={{ marginLeft: 'auto' }}
                onClick={() => void removeNote({ noteId: activeNote._id })}
              >
                Delete
              </button>
            </div>
            <textarea
              className="note-body"
              style={{ width: '100%', minHeight: 360, border: 'none', resize: 'vertical' }}
              value={activeNote.body}
              onChange={(e) =>
                void updateNote({ noteId: activeNote._id, body: e.target.value })
              }
            />
          </section>
        ) : (
          <section className="note-editor">
            <p className="muted">Select or create a note.</p>
          </section>
        )}
      </div>
    </section>
  )
}
