export const BOARD_COLUMN_STATUSES = [
  "investigate",
  "in-progress",
  "review",
  "test",
  "done",
] as const;

export type BoardColumnStatus = (typeof BOARD_COLUMN_STATUSES)[number];

export function isBoardColumnStatus(
  status: string,
): status is BoardColumnStatus {
  return (BOARD_COLUMN_STATUSES as readonly string[]).includes(status);
}
