import { z } from 'zod'
import { BOARD_COLUMN_COLORS } from '../../../convex/lib/boardColumnColors'
import type { BoardColumnColor } from '../../../convex/lib/boardColumnColors'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional(),
  color: z.enum(BOARD_COLUMN_COLORS),
})

export type CreateProjectValues = z.input<typeof createProjectSchema>

export function emptyCreateProjectValues(
  color: BoardColumnColor,
): CreateProjectValues {
  return { name: '', description: '', color }
}
