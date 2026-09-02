import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { useAppForm } from '~/components/form/form-hook'
import { Form } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { TaskHistory } from '~/components/tasks/TaskHistory'
import { TaskFormFields } from '~/components/tasks/TaskFormFields'
import { columnSelectOptions } from '~/lib/board-columns'
import {
  editTaskSchema,
  toUpdateTaskArgs,
  valuesFromTask,
} from '~/lib/forms/edit-task'

type EditTaskModalProps = {
  task: Doc<'tasks'> | null
  onClose: () => void
}

const MUTATION_ERROR = 'Could not save the task. Please try again.'
const DELETE_ERROR = 'Could not delete the task. Please try again.'
const ARCHIVE_ERROR = 'Could not update archive status. Please try again.'

export function EditTaskModal({ task, onClose }: EditTaskModalProps) {
  const projects = useQuery(api.projects.list, { status: 'active' })
  const columns = useQuery(api.boardColumns.list)
  const ensureDefaults = useMutation(api.boardColumns.ensureDefaults)
  const updateTask = useMutation(api.tasks.update)
  const removeTask = useMutation(api.tasks.remove)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (columns && columns.length === 0) void ensureDefaults({})
  }, [columns, ensureDefaults])

  const form = useAppForm({
    defaultValues: task
      ? valuesFromTask(task)
      : valuesFromTask({ title: '', columnId: '' }),
    validators: { onSubmit: editTaskSchema },
    onSubmit: async ({ value }) => {
      if (!task) return
      try {
        const args = toUpdateTaskArgs(value)
        await updateTask({
          taskId: task._id,
          title: args.title,
          notes: args.notes,
          checklist: args.checklist,
          columnId: args.columnId
            ? (args.columnId as Id<'boardColumns'>)
            : null,
          projectId: args.projectId
            ? (args.projectId as Id<'projects'>)
            : null,
          estimateMinutes: args.estimateMinutes,
          dueDate: args.dueDate,
          priority: args.priority,
        })
        onClose()
      } catch {
        form.setErrorMap({
          onSubmit: { form: MUTATION_ERROR, fields: {} },
        })
      }
    },
  })

  useEffect(() => {
    if (!task) return
    form.reset(valuesFromTask(task))
    setConfirmingDelete(false)
    setDeleteError(null)
    setDeleting(false)
    setArchiveError(null)
    setArchiving(false)
  }, [task])

  const handleArchive = async () => {
    if (!task || archiving || deleting) return
    setArchiving(true)
    setArchiveError(null)
    try {
      await updateTask({
        taskId: task._id,
        archived: task.archived !== true,
      })
      onClose()
    } catch {
      setArchiveError(ARCHIVE_ERROR)
      setArchiving(false)
    }
  }

  const handleDelete = async () => {
    if (!task || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await removeTask({ taskId: task._id })
      onClose()
    } catch {
      setDeleteError(DELETE_ERROR)
      setDeleting(false)
    }
  }

  return (
    <Dialog
      open={task != null}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        {task ? (
          <Tabs defaultValue="details">
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1">
                Details
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-4">
              <form.AppForm>
                <Form
                  onSubmit={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void form.handleSubmit()
                  }}
                >
                  <TaskFormFields
                    form={form}
                    idPrefix="edit"
                    projects={projects}
                    lockProject={false}
                    columnOptions={columnSelectOptions(columns ?? [])}
                  />
                  <form.FormError />
                  {deleteError ? (
                    <p className="text-sm text-destructive">{deleteError}</p>
                  ) : null}
                  {archiveError ? (
                    <p className="text-sm text-destructive">{archiveError}</p>
                  ) : null}
                  <div className="flex items-center justify-between gap-2.5">
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) =>
                        confirmingDelete ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Delete this task?</span>
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => void handleDelete()}
                              disabled={deleting || archiving || isSubmitting}
                            >
                              Delete
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setConfirmingDelete(false)}
                            >
                              Keep
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => void handleArchive()}
                              disabled={isSubmitting || archiving || deleting}
                            >
                              {task.archived === true ? 'Restore' : 'Archive'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setConfirmingDelete(true)}
                              disabled={isSubmitting || archiving}
                            >
                              Delete
                            </Button>
                          </div>
                        )
                      }
                    </form.Subscribe>
                    <div className="flex items-center gap-2.5">
                      <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                      </Button>
                      <form.SubmitButton
                        label="Save changes"
                        disabled={deleting || archiving}
                      />
                    </div>
                  </div>
                </Form>
              </form.AppForm>
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <TaskHistory
                taskId={task._id}
                estimateMinutes={task.estimateMinutes}
              />
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
