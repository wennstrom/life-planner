export const BOARD_COLUMN_COLORS = [
  "#6366f1",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ec4899",
  "#a855f7",
  "#14b8a6",
] as const;

export type BoardColumnColor = (typeof BOARD_COLUMN_COLORS)[number];

export function isBoardColumnColor(color: string): color is BoardColumnColor {
  return (BOARD_COLUMN_COLORS as ReadonlyArray<string>).includes(color);
}
