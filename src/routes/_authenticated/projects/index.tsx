import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { AddProjectModal } from '~/components/projects/AddProjectModal'
import { ProjectCard } from '~/components/projects/ProjectCard'

export const Route = createFileRoute('/_authenticated/projects/')({
  component: ProjectsPage,
})

function ProjectsPage() {
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const { data: tasks } = useSuspenseQuery(convexQuery(api.tasks.list, {}))
  const { data: columns } = useSuspenseQuery(
    convexQuery(api.boardColumns.list, {}),
  )
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
        {projects.map((project) => (
          <ProjectCard
            key={project._id}
            project={project}
            tasks={tasks.filter((task) => task.projectId === project._id)}
            columns={columns}
          />
        ))}

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
