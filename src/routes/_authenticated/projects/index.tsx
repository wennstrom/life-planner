import { createFileRoute } from '@tanstack/react-router'
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { AddProjectModal } from '~/components/projects/AddProjectModal'
import { ProjectCard } from '~/components/projects/ProjectCard'
import { formatMinutes } from '~/lib/format'
import { prefetchConvexQueries } from '~/lib/prefetchConvexQueries'
import {
  roundToMinute,
  statsWindow,
  useStatsWindow,
} from '~/lib/project-stats'

export const Route = createFileRoute('/_authenticated/projects/')({
  loader: async ({ context: { queryClient } }) => {
    await prefetchConvexQueries(queryClient, [
      convexQuery(api.projects.list, { status: 'active' }),
      convexQuery(api.tasks.list, {}),
      convexQuery(api.boardColumns.list, {}),
      convexQuery(api.projects.stats, statsWindow(roundToMinute(Date.now()))),
    ])
  },
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
  const statsArgs = useStatsWindow()
  // Keep the last result while the minute ticks over, so cards don't flicker.
  const { data: stats } = useQuery({
    ...convexQuery(api.projects.stats, statsArgs),
    placeholderData: keepPreviousData,
  })
  const [open, setOpen] = useState(false)
  const usedColors = projects.map((project) => project.color)
  const weekSpent = stats
    ? Object.values(stats).reduce((sum, s) => sum + s.spentWeekMinutes, 0)
    : 0
  const weekPlanned = stats
    ? Object.values(stats).reduce((sum, s) => sum + s.plannedWeekMinutes, 0)
    : 0

  return (
    <section>
      <header className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="sr-only text-[30px] font-medium tracking-[-1.1px] md:not-sr-only md:text-[33px]">
            Projects
          </h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {projects.length} active
            {weekPlanned > 0 || weekSpent > 0 ? (
              <>
                {' · '}
                {formatMinutes(weekSpent)} spent of{' '}
                {formatMinutes(weekPlanned)} planned this week
              </>
            ) : null}
          </p>
        </div>
        <Button type="button" className="sm:self-auto" onClick={() => setOpen(true)}>
          + New project
        </Button>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
        {projects.map((project) => (
          <ProjectCard
            key={project._id}
            project={project}
            tasks={tasks.filter((task) => task.projectId === project._id)}
            columns={columns}
            stats={stats?.[project._id]}
            nowMs={statsArgs.nowMs}
          />
        ))}

        <button
          type="button"
          className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-[#c1c1c1] hover:bg-secondary/60 hover:text-foreground"
          onClick={() => setOpen(true)}
        >
          <span className="grid size-10 place-items-center rounded-[10px] bg-secondary">
            <Plus className="size-5" />
          </span>
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
