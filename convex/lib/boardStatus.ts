import { v } from "convex/values";

export const BOARD_COLUMN_STATUSES = [
  "investigate",
  "in-progress",
  "review",
  "test",
  "done",
] as const;

export type BoardColumnStatus = (typeof BOARD_COLUMN_STATUSES)[number];

const [investigate, inProgress, review, test, done] = BOARD_COLUMN_STATUSES;

export const boardColumnStatus = v.union(
  v.literal(investigate),
  v.literal(inProgress),
  v.literal(review),
  v.literal(test),
  v.literal(done),
);
