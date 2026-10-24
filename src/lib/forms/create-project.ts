import { z } from 'zod'
import {
  BOARD_COLUMN_COLORS,
  isBoardColumnColor,
} from '../../../convex/lib/boardColumnColors'
import type { BoardColumnColor } from '../../../convex/lib/boardColumnColors'
import {
  HEALTH_NOTE_MAX_LENGTH,
  PROJECT_HEALTH,
  isCalendarGoalDate,
} from '../../../convex/lib/projectHealth'
import type { ProjectHealth } from '../../../convex/lib/projectHealth'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional(),
  color: z.enum(BOARD_COLUMN_COLORS),
  health: z.union([z.enum(PROJECT_HEALTH), z.literal('')]).optional(),
  healthNote: z
    .string()
    .trim()
    .max(HEALTH_NOTE_MAX_LENGTH, `Keep it under ${HEALTH_NOTE_MAX_LENGTH} characters`)
    .optional(),
  goalDate: z
    .string()
    .optional()
    .refine(
      (value) => !value || isCalendarGoalDate(value),
      'Invalid goal date',
    ),
})

export type CreateProjectValues = z.input<typeof createProjectSchema>

export function emptyCreateProjectValues(
  color: BoardColumnColor,
): CreateProjectValues {
  return {
    name: '',
    description: '',
    color,
    health: '',
    healthNote: '',
    goalDate: '',
  }
}

export function projectFormValues(project: {
  name: string
  description?: string
  color: string
  health?: ProjectHealth
  healthNote?: string
  goalDate?: string
}): CreateProjectValues {
  return {
    name: project.name,
    description: project.description ?? '',
    color: isBoardColumnColor(project.color) ? project.color : '#6366f1',
    health: project.health ?? '',
    healthNote: project.healthNote ?? '',
    goalDate: project.goalDate ?? '',
  }
}
