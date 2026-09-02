import { BOARD_COLUMN_COLORS } from '../../convex/lib/boardColumnColors'
import type { BoardColumnColor } from '../../convex/lib/boardColumnColors'

export function nextProjectColor(
  existingColors: Array<string>,
): BoardColumnColor {
  return (
    BOARD_COLUMN_COLORS.find((color) => !existingColors.includes(color)) ??
    '#6366f1'
  )
}
