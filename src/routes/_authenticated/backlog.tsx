import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { TaskRow } from '~/components/tasks/TaskRow'

export const Route = createFileRoute('/_authenticated/backlog')({
  component: BacklogPage,
})

function BacklogPage() {
  const { data } = useSuspenseQuery(convexQuery(api.backlog.get, {}))
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const sendToToday = useMutation(api.tasks.sendToToday)
  const createTask = useMutation(api.tasks.create)
  const completeTask = useMutation(api.tasks.complete)

  const [filter, setFilter] = useState<string>('all')
  const [newTitle, setNewTitle] = useState('')

  const filteredGroups = useMemo(() => {
    if (filter === 'all') return data.groups
    if (filter === 'none') {
      return data.groups.filter((group) => group.key === 'none')
    }
    return data.groups.filter((group) => group.key === filter)
  }, [data.groups, filter])

  return (
    <section className="view active">
      <header className="view-header">
        <div>
          <h1>Backlog</h1>
          <p className="view-sub">{data.total} unscheduled tasks</p>
        </div>
        <form
          className="view-actions"
          onSubmit={(event) => {
            event.preventDefault()
            if (!newTitle.trim()) return
            void createTask({
              title: newTitle.trim(),
              projectId: filter !== 'all' && filter !== 'none' ? (filter as any) : undefined,
            })
            setNewTitle('')
          }}
        >
          <input
            className="search"
            placeholder="New backlog task…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="submit" className="btn primary">
            + Add task
          </button>
        </form>
      </header>

      <div className="filter-chips">
        <button
          type="button"
          className={`chip${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {projects.map((project) => (
          <button
            key={project._id}
            type="button"
            className={`chip${filter === project._id ? ' active' : ''}`}
            onClick={() => setFilter(project._id)}
          >
            <span className="swatch" style={{ background: project.color }} />
            {project.name}
          </button>
        ))}
        <button
          type="button"
          className={`chip${filter === 'none' ? ' active' : ''}`}
          onClick={() => setFilter('none')}
        >
          No project
        </button>
      </div>

      <div className="backlog-groups">
        {filteredGroups.map((group) => (
          <div key={group.key} className="group">
            <h4 className="group-title">
              {group.color ? (
                <span className="swatch" style={{ background: group.color }} />
              ) : (
                <span className="swatch" style={{ background: '#94a3b8' }} />
              )}
              {group.label}
            </h4>
            <ul className="task-list">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task._id}
                  task={{ ...task, project: null }}
                  showProjectTag={false}
                  onToggle={() =>
                    void completeTask({ taskId: task._id, done: task.status === 'done' ? false : true })
                  }
                  onSendToToday={() => void sendToToday({ taskId: task._id })}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
