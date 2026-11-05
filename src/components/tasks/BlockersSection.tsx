import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { X } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  blockerErrorText,
  blockerPickerOptions,
  blockerStateLabel,
} from '~/lib/task-blockers'
import { cn } from '~/lib/utils'

const ADD_ERROR = 'Could not add the blocker. Please try again.'
const REMOVE_ERROR = 'Could not remove the blocker. Please try again.'

/** "Blocked by" list with a task picker, plus what this task blocks. */
export function BlockersSection({ taskId }: { taskId: Id<'tasks'> }) {
  const blockers = useQuery(api.taskBlockers.listForTask, { taskId })
  const tasks = useQuery(api.tasks.list, {})
  const addBlocker = useMutation(api.taskBlockers.add)
  const removeBlocker = useMutation(api.taskBlockers.remove)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Remount the picker after each add so it shows the placeholder again.
  const [pickerKey, setPickerKey] = useState(0)

  if (blockers === undefined) {
    return <p className="text-xs text-muted-foreground">Loading blockers…</p>
  }

  const options = blockerPickerOptions(
    tasks ?? [],
    taskId,
    blockers.blockedBy.map((row) => row.taskId),
  )

  async function add(blockerTaskId: string) {
    setPending(true)
    setError(null)
    try {
      await addBlocker({
        taskId,
        blockerTaskId: blockerTaskId as Id<'tasks'>,
      })
    } catch (err) {
      setError(blockerErrorText(err, ADD_ERROR))
    } finally {
      setPending(false)
      setPickerKey((key) => key + 1)
    }
  }

  async function remove(blockerTaskId: Id<'tasks'>) {
    setPending(true)
    setError(null)
    try {
      await removeBlocker({ taskId, blockerTaskId })
    } catch (err) {
      setError(blockerErrorText(err, REMOVE_ERROR))
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-label="Blocked by" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Blocked by</h3>
      {blockers.blockedBy.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {blockers.blockedBy.map((blocker) => {
            const state = blockerStateLabel(blocker)
            return (
              <li
                key={blocker.taskId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span
                  className={cn(
                    'min-w-0 truncate',
                    !blocker.open && 'text-muted-foreground line-through',
                  )}
                  title={blocker.title}
                >
                  {blocker.title}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {state ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {state}
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove blocker ${blocker.title}`}
                    disabled={pending}
                    onClick={() => void remove(blocker.taskId)}
                  >
                    <X className="size-4" />
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nothing. Add tasks that must be done first.
        </p>
      )}
      <Select
        key={pickerKey}
        onValueChange={(value) => void add(value)}
        disabled={pending || options.length === 0}
      >
        <SelectTrigger
          className="h-8 w-full text-xs"
          aria-label="Add a blocking task"
        >
          <SelectValue
            placeholder={
              options.length === 0 ? 'No other open tasks' : 'Add a blocking task…'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-xs"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {blockers.blocking.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Blocking: {blockers.blocking.map((row) => row.title).join(', ')}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
