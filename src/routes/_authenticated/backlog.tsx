import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { TaskRow } from '~/components/tasks/TaskRow'

import type { Id } from '../../../convex/_generated/dataModel'

export const Route = createFileRoute('/_authenticated/backlog')({
  component: BacklogPage,
})

function BacklogPage() {
  const { data } = useSuspenseQuery(convexQuery(api.backlog.get, {}))
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const sendToToday = useMutation(api.tasks.sendToToday)
  const completeTask = useMutation(api.tasks.complete)

  const [filter, setFilter] = useState<Id<'projects'> | 'all' | 'none'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const defaultProjectId =
    filter !== 'all' && filter !== 'none' ? filter : undefined

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
        <div className="view-actions">
          <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
            + Add task
          </button>
        </div>
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

      <AddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultProjectId={defaultProjectId}
      />
    </section>
  )
}
