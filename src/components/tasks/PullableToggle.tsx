import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'

const SAVE_ERROR = 'Could not save. Please try again.'

/** "Agents may pick this up". Saves on change; people only, never agents. */
export function PullableToggle({
  taskId,
  pullable,
}: {
  taskId: Id<'tasks'>
  pullable: boolean
}) {
  const setPullable = useMutation(api.tasks.setPullable)
  const [checked, setChecked] = useState(pullable)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setChecked(pullable)
    setError(null)
  }, [taskId, pullable])

  async function toggle(next: boolean) {
    setChecked(next)
    setPending(true)
    setError(null)
    try {
      await setPullable({ taskId, pullable: next })
    } catch {
      setChecked(!next)
      setError(SAVE_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={`pullable-${taskId}`}
          checked={checked}
          disabled={pending}
          onCheckedChange={(next) => void toggle(next === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor={`pullable-${taskId}`}
          className="flex-col items-start gap-1 leading-snug"
        >
          <span>Agents may pick this up</span>
          <span className="text-xs font-normal text-muted-foreground">
            Connected agents can claim and work on this task.
          </span>
        </Label>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
