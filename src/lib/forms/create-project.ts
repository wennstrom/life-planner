import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
})

export type CreateProjectValues = z.input<typeof createProjectSchema>
