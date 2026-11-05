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

/** Virtual backlog column — not user-editable, so it sits outside the palette. */
export const BACKLOG_COLUMN_COLOR = "#64748b";

export const DEFAULT_BOARD_COLUMNS: ReadonlyArray<{
  name: string;
  color: BoardColumnColor;
  isDone: boolean;
}> = [
  { name: "In-Progress", color: "#3b82f6", isDone: false },
  { name: "Test", color: "#eab308", isDone: false },
  { name: "Review", color: "#a855f7", isDone: false },
  { name: "Done", color: "#22c55e", isDone: true },
];

/** The Review column added for users whose board predates it. */
export const REVIEW_COLUMN = { name: "Review", color: "#a855f7" } as const;

/** Most columns a board may have, Done included. */
export const MAX_BOARD_COLUMNS = 8;

export function isBoardColumnColor(color: string): color is BoardColumnColor {
  return (BOARD_COLUMN_COLORS as ReadonlyArray<string>).includes(color);
}

export function normalizeColumnName(name: string): string {
  return name.trim();
}

/**
 * A column name reduced for matching by role: lower case, with runs of
 * spaces, hyphens and underscores as one space. "In-Progress" → "in progress".
 */
export function columnRoleKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}
