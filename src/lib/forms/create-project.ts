import { z } from 'zod'
import {
  BOARD_COLUMN_COLORS,
  isBoardColumnColor,
} from '../../../convex/lib/boardColumnColors'
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

export function projectFormValues(project: {
  name: string
  description?: string
  color: string
}): CreateProjectValues {
  return {
    name: project.name,
    description: project.description ?? '',
    color: isBoardColumnColor(project.color) ? project.color : '#6366f1',
  }
}
