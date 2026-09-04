import { Link } from '@tanstack/react-router'
import type { Id } from '../../../convex/_generated/dataModel'
import { Progress } from '~/components/ui/progress'
import { cn } from '~/lib/utils'
import { formatDateKey } from '~/lib/dates'
import {
  PROJECT_HEALTH_DOT_CLASS,
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_PILL_CLASS,
  goalDateCaption,
  type ProjectHealth,
} from '~/lib/project-health'
import { projectProgress } from '~/lib/project-progress'

type ProjectCardProps = {
  project: {
    _id: Id<'projects'>
    name: string
    description?: string
    color: string
    health?: ProjectHealth
    goalDate?: string
  }
  tasks: Array<{ columnId?: string }>
  columns: Array<{ _id: string; isDone: boolean }>
  today?: string
}

export function ProjectCard({
  project,
  tasks,
  columns,
  today = formatDateKey(),
}: ProjectCardProps) {
  const { leftover, done, percent } = projectProgress(tasks, columns)
  const caption = goalDateCaption(project.goalDate, today)
  const description = project.description?.trim()
  const showMeta = project.health !== undefined || caption !== null

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project._id }}
      className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-soft transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {showMeta ? (
        <div
          className={cn(
            'mb-2.5 flex items-center gap-2',
            project.health ? 'justify-between' : 'justify-end',
          )}
        >
          {project.health ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                PROJECT_HEALTH_PILL_CLASS[project.health],
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  PROJECT_HEALTH_DOT_CLASS[project.health],
                )}
              />
              {PROJECT_HEALTH_LABEL[project.health]}
            </span>
          ) : null}
          {caption ? (
            <span
              className={cn(
                'text-xs text-muted-foreground',
                caption.overdue && 'font-semibold text-destructive',
              )}
            >
              {caption.text}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-[4px]"
          style={{ background: project.color }}
          aria-hidden
        />
        <h3 className="text-base font-semibold">{project.name}</h3>
      </div>
      {description ? (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mb-3 mt-4 text-sm text-muted-foreground">
        {leftover} leftover · {done} done
      </div>
      <Progress value={percent} className="h-1.5" />
    </Link>
  )
}
