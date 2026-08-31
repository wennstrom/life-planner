import { ChevronDownIcon } from 'lucide-react'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover'
import { toggleTaskId } from '~/lib/forms/add-time-block'
import { cn } from '~/lib/utils'

export type TaskOption = { id: string; title: string }

type TaskMultiSelectProps = {
  id: string
  taskIds: string[]
  options: TaskOption[]
  onChange: (taskIds: string[]) => void
}

export function TaskMultiSelect({
  id,
  taskIds,
  options,
  onChange,
}: TaskMultiSelectProps) {
  const selected = new Set(taskIds)
  const titleById = new Map(options.map((task) => [task.id, task.title]))
  const listed = [
    ...taskIds
      .filter((taskId) => !titleById.has(taskId))
      .map((taskId) => ({ id: taskId, title: 'Task' })),
    ...options,
  ]

  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {taskIds.length === 0 ? (
              <span className="text-muted-foreground">
                Personal block (no task)
              </span>
            ) : (
              taskIds.map((taskId) => (
                <Badge
                  key={taskId}
                  variant="secondary"
                  className="max-w-full"
                >
                  <span className="min-w-0 truncate">
                    {titleById.get(taskId) ?? 'Task'}
                  </span>
                </Badge>
              ))
            )}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
      >
        {listed.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No tasks in the backlog
          </p>
        ) : (
          <ul className="max-h-56 overflow-auto">
            {listed.map((task) => (
              <li key={task.id}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                    'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Checkbox
                    checked={selected.has(task.id)}
                    onCheckedChange={() =>
                      onChange(toggleTaskId(taskIds, task.id))
                    }
                  />
                  <span className="min-w-0 truncate">{task.title}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
