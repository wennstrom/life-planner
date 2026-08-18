import { useEffect, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'

type ProjectDeleteDialogProps = {
  open: boolean
  onClose: () => void
  onConfirm: (deleteTasks: boolean) => void | Promise<unknown>
  projectName: string
  taskCount: number
}

export function ProjectDeleteDialog({
  open,
  onClose,
  onConfirm,
  projectName,
  taskCount,
}: ProjectDeleteDialogProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<'unlink' | 'delete' | null>(null)

  useEffect(() => {
    if (!open) {
      setPending(false)
      setError(null)
      setChoice(null)
    }
  }, [open])

  const hasTasks = taskCount > 0
  const canConfirm = !pending && (!hasTasks || choice != null)

  const handleConfirm = async () => {
    if (!canConfirm) return

    setPending(true)
    setError(null)
    try {
      await onConfirm(choice === 'delete')
      onClose()
    } catch {
      setError('Could not delete the project. Please try again.')
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <DialogContent className="sm:max-w-[440px]" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Delete project?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{projectName}</span>{' '}
            will be permanently deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {hasTasks ? (
          <fieldset className="flex flex-col gap-2.5">
            <span className="text-sm font-medium">What should happen to tasks?</span>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="radio"
                name="project-delete-tasks"
                value="unlink"
                checked={choice === 'unlink'}
                onChange={() => setChoice('unlink')}
                className="mt-0.5"
                disabled={pending}
              />
              <span>Keep tasks in the backlog</span>
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="radio"
                name="project-delete-tasks"
                value="delete"
                checked={choice === 'delete'}
                onChange={() => setChoice('delete')}
                className="mt-0.5"
                disabled={pending}
              />
              <span>
                Delete {taskCount} task{taskCount === 1 ? '' : 's'}. (This will also
                delete their time blocks and cancel linked Google Calendar
                events.)
              </span>
            </label>
          </fieldset>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Keep
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
