import { z } from 'zod'
import { BOARD_COLUMN_COLORS } from '../../../convex/lib/boardColumnColors'
import type { BoardColumnColor } from '../../../convex/lib/boardColumnColors'
import { PROJECT_HEALTH, isCalendarGoalDate } from '../../../convex/lib/projectHealth'
import type { ProjectHealth } from '../../../convex/lib/projectHealth'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional(),
  color: z.enum(BOARD_COLUMN_COLORS),
  health: z.enum(PROJECT_HEALTH),
  goalDate: z
    .string()
    .optional()
    .refine((value) => !value || isCalendarGoalDate(value), 'Invalid goal date'),
})

export type CreateProjectValues = z.input<typeof createProjectSchema>

export function emptyCreateProjectValues(
  color: BoardColumnColor,
): CreateProjectValues {
  return {
    name: '',
    description: '',
    color,
    health: 'onTrack' satisfies ProjectHealth,
    goalDate: '',
  }
}
