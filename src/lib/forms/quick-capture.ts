import { addTaskSchema } from './add-task'

/** Quick capture is the add-task form cut down to a title and a project. */
export const quickCaptureSchema = addTaskSchema.pick({
  title: true,
  projectId: true,
})

export type QuickCaptureValues = {
  title: string
  projectId: string
}

export function emptyQuickCaptureValues(projectId = ''): QuickCaptureValues {
  return { title: '', projectId }
}

/** Args for `tasks.create`. No column, so the task lands in Backlog. */
export function toQuickCaptureArgs(values: QuickCaptureValues) {
  return {
    title: values.title.trim(),
    projectId: values.projectId || undefined,
  }
}
