import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Progress } from '~/components/ui/progress'
import { AddProjectModal } from '~/components/projects/AddProjectModal'

export const Route = createFileRoute('/_authenticated/projects/')({
  component: ProjectsPage,
})

function ProjectsPage() {
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const { data: tasks } = useSuspenseQuery(convexQuery(api.tasks.list, {}))
  const [open, setOpen] = useState(false)
  const usedColors = projects.map((project) => project.color)

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length} active
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          + New project
        </Button>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[18px]">
        {projects.map((project) => {
          const projectTasks = tasks.filter(
            (task) => task.projectId === project._id,
          )
          const done = projectTasks.filter(
            (task) => task.status === 'done',
          ).length
          const progress =
            projectTasks.length === 0
              ? 0
              : Math.round((done / projectTasks.length) * 100)

          return (
            <Link
              key={project._id}
              to="/projects/$projectId"
              params={{ projectId: project._id }}
              className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-soft transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="absolute inset-y-0 left-0 w-[5px]"
                style={{ background: project.color }}
              />
              <h3 className="mb-1.5 text-base font-semibold">{project.name}</h3>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                {project.description ?? 'No description yet.'}
              </p>
              <div className="mb-3 flex gap-2 text-sm text-muted-foreground">
                <span>{projectTasks.length} tasks</span>
                <span>·</span>
                <span>{done} done</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </Link>
          )
        })}

        <button
          type="button"
          className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:bg-secondary"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-7" />
          <span>New project</span>
        </button>
      </div>

      <AddProjectModal
        open={open}
        onClose={() => setOpen(false)}
        usedColors={usedColors}
      />
    </section>
  )
}
