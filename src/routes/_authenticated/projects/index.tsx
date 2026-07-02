import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { api } from '../../../../convex/_generated/api'

export const Route = createFileRoute('/_authenticated/projects/')({
  component: ProjectsPage,
})

const COLORS = ['#6366f1', '#22c55e', '#eab308', '#ec4899', '#14b8a6']

function ProjectsPage() {
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const { data: tasks } = useSuspenseQuery(convexQuery(api.tasks.list, {}))
  const createProject = useMutation(api.projects.create)

  const [name, setName] = useState('')
  const [showForm, setShowForm] = useState(false)

  return (
    <section className="view active">
      <header className="view-header">
        <div>
          <h1>Projects</h1>
          <p className="view-sub">{projects.length} active</p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn primary" onClick={() => setShowForm(true)}>
            + New project
          </button>
        </div>
      </header>

      {showForm ? (
        <form
          style={{ marginBottom: 20, display: 'flex', gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            void createProject({
              name: name.trim(),
              color: COLORS[projects.length % COLORS.length],
            })
            setName('')
            setShowForm(false)
          }}
        >
          <input
            className="search"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn primary">
            Create
          </button>
        </form>
      ) : null}

      <div className="project-cards">
        {projects.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project._id)
          const done = projectTasks.filter((task) => task.status === 'done').length
          const progress =
            projectTasks.length === 0 ? 0 : Math.round((done / projectTasks.length) * 100)

          return (
            <Link
              key={project._id}
              to="/projects/$projectId"
              params={{ projectId: project._id }}
              className="project-card"
              style={{ ['--accent' as string]: project.color }}
            >
              <div className="project-bar" />
              <h3>{project.name}</h3>
              <p className="project-desc">{project.description ?? 'No description yet.'}</p>
              <div className="project-meta">
                <span>{projectTasks.length} tasks</span>
                <span className="muted">·</span>
                <span>{done} done</span>
              </div>
              <div className="progress">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </Link>
          )
        })}

        <button
          type="button"
          className="project-card add-card"
          onClick={() => setShowForm(true)}
        >
          <span className="add-plus">+</span>
          <span>New project</span>
        </button>
      </div>
    </section>
  )
}
