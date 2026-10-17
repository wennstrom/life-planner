import { Link } from '@tanstack/react-router'
import { FolderKanban } from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { ProjectHealth } from '~/lib/project-health'
import { Progress } from '~/components/ui/progress'
import { cn } from '~/lib/utils'
import { formatDateKey } from '~/lib/dates'
import {
  PROJECT_HEALTH_DOT_CLASS,
  PROJECT_HEALTH_LABEL,
  goalDateCaption,
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
  const { done, percent } = projectProgress(tasks, columns)
  const caption = goalDateCaption(project.goalDate, today)
  const description = project.description?.trim()

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project._id }}
      className="flex min-h-[260px] flex-col rounded-[14px] border border-border bg-card p-[25px] transition-colors hover:border-[#c1c1c1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-10 place-items-center rounded-[8px] bg-[#f2f2f4] text-[#515154]">
        <FolderKanban className="size-5" aria-hidden />
      </span>
      <h2 className="mt-6 text-[15px] font-medium">{project.name}</h2>
      {description ? (
        <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : (
        <div className="flex-1" />
      )}
      {project.health ? (
        <span className="mt-4 flex items-center gap-1.5 text-xs text-[#747474]">
          <span
            className={cn(
              'size-[7px] rounded-full',
              PROJECT_HEALTH_DOT_CLASS[project.health],
            )}
          />
          {PROJECT_HEALTH_LABEL[project.health]}
        </span>
      ) : null}
      <div className="mt-[18px] flex items-center gap-3">
        <Progress value={percent} className="h-1 min-w-0 flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {done} of {tasks.length} tasks
        </span>
        {caption ? (
          <span className={cn(caption.overdue && 'font-semibold text-destructive')}>
            {caption.text}
          </span>
        ) : null}
      </div>
    </Link>
  )
}
