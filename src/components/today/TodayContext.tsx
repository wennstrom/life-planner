import { Link } from '@tanstack/react-router'
import type { Id } from '../../../convex/_generated/dataModel'
import type { ProjectHealth } from '~/lib/project-health'
import { Button } from '~/components/ui/button'
import { formatMinutes } from '~/lib/format'
import { PROJECT_HEALTH_LABEL } from '~/lib/project-health'

type FocusTask = {
  _id: Id<'tasks'>
  title: string
  columnId?: Id<'boardColumns'>
  estimateMinutes?: number
  project: { name: string } | null
}

type TodayContextProps = {
  tasks: Array<FocusTask>
  doneColumnId: string | undefined
  projects: Array<{
    _id: Id<'projects'>
    name: string
    order: number
    health?: ProjectHealth
    done: number
    total: number
  }>
  shutdownCompleted: boolean
  shutdownNote: string | undefined
  needReviewCount: number
  onToggleTask: (taskId: Id<'tasks'>, checked: boolean) => void
  onAddBlock: () => void
  onStartShutdown: () => void
}

export function TodayContext({
  tasks,
  doneColumnId,
  projects,
  shutdownCompleted,
  shutdownNote,
  needReviewCount,
  onToggleTask,
  onAddBlock,
  onStartShutdown,
}: TodayContextProps) {
  const doneCount = tasks.filter((task) => task.columnId === doneColumnId).length
  const donePercent = tasks.length === 0 ? 0 : (doneCount / tasks.length) * 100
  const movingForward = [...projects]
    .sort((a, b) => a.order - b.order)
    .slice(0, 2)
  const trimmedNote = shutdownNote?.trim()

  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby="today-focus-heading">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="today-focus-heading" className="text-base font-medium">
            Today&apos;s focus{' '}
            <span className="text-sm font-normal text-muted-foreground">
              {tasks.length}
            </span>
          </h2>
          <Link to="/backlog" className="text-xs text-muted-foreground hover:text-foreground">
            All tasks
          </Link>
        </div>

        <div className="rounded-[14px] border border-border bg-white">
          {tasks.length > 0 ? (
            <ul className="divide-y divide-border">
              {tasks.map((task) => (
                <li key={task._id}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={task.columnId === doneColumnId}
                      onChange={(event) =>
                        onToggleTask(task._id, event.target.checked)
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{task.title}</span>
                      {task.project ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {task.project.name}
                        </span>
                      ) : null}
                    </span>
                    {task.estimateMinutes ? (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatMinutes(task.estimateMinutes)}
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={onAddBlock}
            className="w-full border-t border-border px-4 py-3 text-left text-xs text-muted-foreground first:border-t-0 hover:text-foreground"
          >
            Add a task to today
          </button>
        </div>

        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-[#e8e8e8]">
            <div
              className="h-full rounded-full bg-[#1d1d1f]"
              style={{ width: `${donePercent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {`${doneCount} of ${tasks.length} complete`}
          </p>
        </div>
      </section>

      <section aria-labelledby="moving-forward-heading">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="moving-forward-heading" className="text-base font-medium">
            Moving forward
          </h2>
          <Link to="/projects" className="text-xs text-muted-foreground hover:text-foreground">
            Projects
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {movingForward.map((project) => (
            <Link
              key={project._id}
              to="/projects/$projectId"
              params={{ projectId: project._id }}
              className="rounded-[14px] border border-border bg-white px-4 py-3"
            >
              <span className="block truncate text-sm font-medium">{project.name}</span>
              <span className="block text-xs text-muted-foreground">
                {`${project.done} of ${project.total} tasks complete`}
                {project.health ? ` · ${PROJECT_HEALTH_LABEL[project.health]}` : ''}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Shutdown">
        {shutdownCompleted && trimmedNote ? (
          <p className="mb-2 text-sm text-muted-foreground">{trimmedNote}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onStartShutdown}
        >
          {needReviewCount > 0 && !shutdownCompleted
            ? `Review ${needReviewCount}`
            : 'Start shutdown'}
        </Button>
      </section>
    </div>
  )
}
