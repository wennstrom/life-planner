import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field, FieldLabel } from '~/components/ui/field'

const SAVE_ERROR = 'Could not save goal date.'

type ProjectGoalDateProps = {
  projectId: Id<'projects'>
  goalDate?: string
}

export function ProjectGoalDate({ projectId, goalDate }: ProjectGoalDateProps) {
  const updateProject = useMutation(api.projects.update)
  const saved = goalDate ?? ''
  const [value, setValue] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setValue(saved)
  }, [saved])

  async function save(next: string) {
    const trimmed = next.trim()
    if (trimmed === saved) {
      setError(null)
      return
    }
    setPending(true)
    try {
      await updateProject({
        projectId,
        goalDate: trimmed === '' ? null : trimmed,
      })
      setError(null)
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message === 'Invalid goal date'
          ? caught.message
          : SAVE_ERROR
      setError(message)
      setValue(saved)
    } finally {
      setPending(false)
    }
  }

  return (
    <Field className="mt-3 max-w-xs">
      <FieldLabel htmlFor="project-goal-date">Goal date</FieldLabel>
      <div className="flex gap-2">
        <Input
          id="project-goal-date"
          type="date"
          value={value}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            void save(value)
          }}
        />
        {saved ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setValue('')
              void save('')
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Field>
  )
}
