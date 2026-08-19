import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { AddTimeBlockModal } from '~/components/time-block/AddTimeBlockModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import {
  BacklogTasksTable,
  type BacklogTask,
} from '~/components/tasks/BacklogTasksTable'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

export const Route = createFileRoute('/_authenticated/backlog')({
  component: BacklogPage,
})

function BacklogPage() {
  const { data } = useSuspenseQuery(convexQuery(api.backlog.get, {}))
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const updateTask = useMutation(api.tasks.update)
  const removeTask = useMutation(api.tasks.remove)

  const [filter, setFilter] = useState<Id<'projects'> | 'all' | 'none'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [planTaskId, setPlanTaskId] = useState<Id<'tasks'> | null>(null)
  const [editingTask, setEditingTask] = useState<BacklogTask | null>(null)
  const [taskToDelete, setTaskToDelete] = useState<BacklogTask | null>(null)
  const defaultProjectId =
    filter !== 'all' && filter !== 'none' ? filter : undefined

  const filteredTasks = useMemo(() => {
    const groups =
      filter === 'all'
        ? data.groups
        : filter === 'none'
          ? data.groups.filter((group) => group.key === 'none')
          : data.groups.filter((group) => group.key === filter)

    return groups.flatMap((group) => group.tasks)
  }, [data.groups, filter])

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Backlog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.total} tasks
          </p>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          + Add task
        </Button>
      </header>

      <div className="mb-5">
        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as Id<'projects'> | 'all' | 'none')}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Show All</SelectItem>
            <SelectItem value="none">Tasks without a project</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project._id} value={project._id}>
                <span
                  className="mr-2 inline-block size-2.5 rounded-full align-middle"
                  style={{ background: project.color }}
                />
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <BacklogTasksTable
        tasks={filteredTasks}
        actions={{
          toggle: (taskId, done) =>
            void updateTask({
              taskId,
              status: done ? 'done' : 'backlog',
            }),
          plan: setPlanTaskId,
          openDetails: setEditingTask,
          remove: setTaskToDelete,
        }}
      />

      <AddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultProjectId={defaultProjectId}
      />
      <AddTimeBlockModal
        open={planTaskId != null}
        onClose={() => setPlanTaskId(null)}
        defaultTaskId={planTaskId ?? undefined}
      />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
      <ConfirmDialog
        open={taskToDelete != null}
        onClose={() => setTaskToDelete(null)}
        onConfirm={() => removeTask({ taskId: taskToDelete!._id })}
        title="Delete task?"
        description={
          taskToDelete ? (
            <>
              <span className="font-medium text-foreground">
                {taskToDelete.title}
              </span>{' '}
              will be permanently deleted. This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        confirmVariant="destructive"
        errorMessage="Could not delete the task. Please try again."
      />
    </section>
  )
}
