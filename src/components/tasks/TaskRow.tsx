import type { Doc } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { Checkbox } from '~/components/ui/checkbox'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'

type TaskRowProps = {
  task: Doc<'tasks'> & { project?: Doc<'projects'> | null }
  onToggle?: () => void
  onSendToToday?: () => void
  onRemoveFromToday?: () => void
  onOpenDetails?: () => void
  showProjectTag?: boolean
}

export function TaskRow({
  task,
  onToggle,
  onSendToToday,
  onRemoveFromToday,
  onOpenDetails,
  showProjectTag = true,
}: TaskRowProps) {
  const done = task.status === 'done'

  return (
    <li className="group flex items-center gap-3 rounded-md border border-border bg-card p-3 shadow-soft">
      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle?.()}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
        className="size-5 rounded-md data-[state=checked]:border-success data-[state=checked]:bg-success"
      />
      {onOpenDetails ? (
        <button
          type="button"
          className={cn(
            'flex-1 text-left text-sm hover:underline',
            done && 'text-muted-foreground line-through hover:no-underline',
          )}
          onClick={onOpenDetails}
        >
          {task.title}
        </button>
      ) : (
        <span
          className={cn(
            'flex-1 text-sm',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </span>
      )}
      {showProjectTag && task.project ? (
        <Badge
          className="rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold"
          style={
            {
              color: task.project.color,
              backgroundColor: `color-mix(in srgb, ${task.project.color} 14%, transparent)`,
            }
          }
        >
          {task.project.name}
        </Badge>
      ) : null}
      {onSendToToday ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-primary opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onSendToToday}
        >
          → Today
        </Button>
      ) : null}
      {onRemoveFromToday ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-primary opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onRemoveFromToday}
        >
          Remove
        </Button>
      ) : null}
    </li>
  )
}
