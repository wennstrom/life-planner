import { Link } from '@tanstack/react-router'
import { Clock, Flag, FolderKanban } from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { ProjectHealth } from '~/lib/project-health'
import type { ProjectTimeStats } from '~/lib/project-stats'
import { Progress } from '~/components/ui/progress'
import { cn } from '~/lib/utils'
import { formatDateKey } from '~/lib/dates'
import { formatMinutes } from '~/lib/format'
import {
  PROJECT_HEALTH_DOT_CLASS,
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_PILL_CLASS,
  goalDateCaption,
} from '~/lib/project-health'
import { projectProgress } from '~/lib/project-progress'
import {
  STALLED_AFTER_DAYS_DEFAULT,
  formatLastBlock,
  hasAnyBlocks,
  isStalled,
} from '~/lib/project-stats'

type ProjectCardProps = {
  project: {
    _id: Id<'projects'>
    name: string
    description?: string
    color: string
    _creationTime?: number
    health?: ProjectHealth
    healthNote?: string
    goalDate?: string
  }
  tasks: Array<{ columnId?: string }>
  columns: Array<{ _id: string; isDone: boolean }>
  today?: string
  /** From `projects.stats`. Without it the card shows tasks and health only. */
  stats?: ProjectTimeStats
  nowMs?: number
}

export function ProjectCard({
  project,
  tasks,
  columns,
  today = formatDateKey(),
  stats,
  nowMs = Date.now(),
}: ProjectCardProps) {
  const { done, percent } = projectProgress(tasks, columns)
  const caption = goalDateCaption(project.goalDate, today)
  const description = project.description?.trim()
  const lastBlock = stats ? formatLastBlock(stats.lastBlockStart, nowMs) : null
  const stalled =
    stats !== undefined &&
    project._creationTime !== undefined &&
    isStalled(stats, project._creationTime, nowMs)
  const showTime = stats !== undefined && hasAnyBlocks(stats)

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project._id }}
      className="group flex min-h-[260px] flex-col rounded-[14px] border border-border bg-card p-6 transition-[border-color,box-shadow] hover:border-[#c1c1c1] hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-[10px]"
          style={{ background: `${project.color}1f`, color: project.color }}
        >
          <FolderKanban className="size-5" aria-hidden />
        </span>
        {project.health ? (
          <span
            className={cn(
              'inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              PROJECT_HEALTH_PILL_CLASS[project.health],
            )}
            title={project.healthNote}
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                PROJECT_HEALTH_DOT_CLASS[project.health],
              )}
            />
            <span className="shrink-0">{PROJECT_HEALTH_LABEL[project.health]}</span>
            {project.healthNote ? (
              <span className="truncate font-normal opacity-80">
                · {project.healthNote}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <h2 className="mt-5 text-[15px] font-medium leading-snug">
        {project.name}
      </h2>
      {description ? (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      {caption || lastBlock || stalled ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {caption ? (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                caption.overdue && 'font-semibold text-destructive',
              )}
            >
              <Flag className="size-3" aria-hidden />
              {caption.text}
            </span>
          ) : null}
          {lastBlock || stalled ? (
            <span
              className="inline-flex items-center gap-1"
              title={
                stalled
                  ? `No time blocked in ${STALLED_AFTER_DAYS_DEFAULT} days`
                  : undefined
              }
            >
              <Clock className="size-3" aria-hidden />
              {(lastBlock ?? 'No blocks yet').replace('Last block: ', '')}
              {stalled ? ' · stalled' : null}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1" />

      <div className="mt-5 flex items-center gap-3">
        <Progress value={percent} className="h-1 min-w-0 flex-1" />
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {done} of {tasks.length} · {percent}%
        </span>
      </div>

      {showTime ? (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 tabular-nums">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              This week
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {formatMinutes(stats.spentWeekMinutes)}
              {stats.plannedWeekMinutes !== stats.spentWeekMinutes ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {formatMinutes(stats.plannedWeekMinutes)}
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              All-time
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {formatMinutes(stats.spentAllTimeMinutes)}
            </p>
          </div>
        </div>
      ) : null}
    </Link>
  )
}
