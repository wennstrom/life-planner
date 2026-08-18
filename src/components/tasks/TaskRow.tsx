import { useRef } from 'react'
import { CalendarPlus, Trash2 } from 'lucide-react'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { TaskStats } from '../../../convex/lib/taskStats'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Checkbox } from '~/components/ui/checkbox'
import { formatTaskRollup } from '~/lib/format'

type TaskRowProps = {
  task: Doc<'tasks'> & { project?: Doc<'projects'> | null }
  stats?: TaskStats
  active?: boolean
  estimateMinutes?: number
  onToggleDone?: (done: boolean) => void
  onPlan?: () => void
  onOpenDetails?: () => void
  onRemove?: () => void
  showProjectTag?: boolean
  extraActions?: React.ReactNode
}

export function TaskRow({
  task,
  stats,
  active,
  estimateMinutes,
  onToggleDone,
  onPlan,
  onOpenDetails,
  onRemove,
  showProjectTag = true,
  extraActions,
}: TaskRowProps) {
  const done = task.status === 'done'
  const suppressOpenDetailsRef = useRef(false)

  const openDetails = () => {
    if (!onOpenDetails || suppressOpenDetailsRef.current) return
    onOpenDetails()
  }

  const rollupStats = stats ?? { spentMinutes: 0, blockCount: 0 }
  const showRollup = stats != null && stats.blockCount > 0

  return (
    <li
      className={cn(
        'group flex items-center gap-3 rounded-md border border-border bg-card p-3 shadow-soft transition-colors',
        onOpenDetails &&
          'cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      role={onOpenDetails ? 'button' : undefined}
      tabIndex={onOpenDetails ? 0 : undefined}
      onClick={onOpenDetails ? openDetails : undefined}
      onKeyDown={
        onOpenDetails
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openDetails()
              }
            }
          : undefined
      }
    >
      {onToggleDone ? (
        <Checkbox
          checked={done}
          aria-label={done ? 'Mark not done' : 'Mark done'}
          onCheckedChange={(checked) => onToggleDone(checked === true)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'flex text-sm',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </span>
        {showRollup ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatTaskRollup(rollupStats, estimateMinutes ?? task.estimateMinutes)}
          </p>
        ) : null}
      </div>

      {active ? (
        <Badge variant="secondary" className="shrink-0 text-[11px]">
          Active
        </Badge>
      ) : null}

      {onPlan ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onPlan()
          }}
        >
          <CalendarPlus className="mr-1 size-3.5" />
          Plan
        </Button>
      ) : null}

      {showProjectTag && task.project ? (
        <Badge
          className="shrink-0 rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold"
          style={{
            color: task.project.color,
            backgroundColor: `color-mix(in srgb, ${task.project.color} 14%, transparent)`,
          }}
        >
          {task.project.name}
        </Badge>
      ) : null}

      {extraActions}

      {onRemove ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="ml-auto shrink-0 text-primary text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </li>
  )
}
