import { z } from 'zod'

export const shutdownNoteSchema = z.object({
  note: z.string(),
})

export type ShutdownNoteValues = z.input<typeof shutdownNoteSchema>
