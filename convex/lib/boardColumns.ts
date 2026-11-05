import {
  DEFAULT_BOARD_COLUMNS,
  MAX_BOARD_COLUMNS,
  REVIEW_COLUMN,
  columnRoleKey,
  isBoardColumnColor,
  normalizeColumnName,
} from "./boardColumnColors";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function listColumnsForUser(
  ctx: Ctx,
  userId: string,
): Promise<Array<Doc<"boardColumns">>> {
  const rows = await ctx.db
    .query("boardColumns")
    .withIndex("by_user_order", (q) => q.eq("userId", userId))
    .collect();
  return rows.sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
}

export async function getDoneColumn(
  ctx: Ctx,
  userId: string,
): Promise<Doc<"boardColumns"> | null> {
  const columns = await listColumnsForUser(ctx, userId);
  return columns.find((column) => column.isDone) ?? null;
}

/** Columns agents look up by role. Matched with `columnRoleKey`. */
export type ColumnRole = "test" | "review" | "in progress";

const COLUMN_ROLE_LABEL: Record<ColumnRole, string> = {
  test: "Test",
  review: "Review",
  "in progress": "In Progress",
};

/**
 * The user's workflow column named `role` ("In-Progress", "in progress" and
 * "IN_PROGRESS" all match "in progress"), or null. The caller must apply agentGate before an agent move.
 */
export async function findColumnByName(
  ctx: Ctx,
  userId: string,
  role: ColumnRole,
): Promise<Doc<"boardColumns"> | null> {
  const columns = await listColumnsForUser(ctx, userId);
  return columns.find((column) => columnRoleKey(column.name) === role) ?? null;
}

/** Like `findColumnByName`, but throws an error an agent can act on. */
export async function requireColumnByName(
  ctx: Ctx,
  userId: string,
  role: ColumnRole,
): Promise<Doc<"boardColumns">> {
  const column = await findColumnByName(ctx, userId, role);
  if (!column) {
    const label = COLUMN_ROLE_LABEL[role];
    throw new Error(
      `Add ${role === "in progress" ? "an" : "a"} ${label} column to your board`,
    );
  }
  return column;
}

export type AddReviewColumnResult =
  "added" | "exists" | "noColumns" | "boardFull";

/**
 * Adds a Review column directly before the done column (or last, if there is
 * no done column) unless one exists. Idempotent.
 */
export async function addReviewColumnForUser(
  ctx: MutationCtx,
  userId: string,
): Promise<AddReviewColumnResult> {
  const columns = await listColumnsForUser(ctx, userId);
  if (columns.length === 0) return "noColumns";
  if (columns.some((column) => columnRoleKey(column.name) === "review")) {
    return "exists";
  }
  if (columns.length >= MAX_BOARD_COLUMNS) return "boardFull";

  const doneIndex = columns.findIndex((column) => column.isDone);
  const insertAt = doneIndex === -1 ? columns.length : doneIndex;
  const reviewId = await ctx.db.insert("boardColumns", {
    userId,
    name: REVIEW_COLUMN.name,
    color: REVIEW_COLUMN.color,
    order: insertAt,
    isDone: false,
  });
  // Renumber so orders stay 0..n-1 with Review in its slot.
  const ordered = [
    ...columns.slice(0, insertAt).map((column) => column._id),
    reviewId,
    ...columns.slice(insertAt).map((column) => column._id),
  ];
  const before = new Map(columns.map((column) => [column._id, column.order]));
  for (const [order, id] of ordered.entries()) {
    if (id !== reviewId && before.get(id) !== order) {
      await ctx.db.patch("boardColumns", id, { order });
    }
  }
  return "added";
}

export async function requireOwnedColumn(
  ctx: Ctx,
  userId: string,
  columnId: Id<"boardColumns">,
): Promise<Doc<"boardColumns">> {
  const column = await ctx.db.get("boardColumns", columnId);
  if (!column || column.userId !== userId) {
    throw new Error("Task not found");
  }
  return column;
}

export async function seedDefaultColumns(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const existing = await listColumnsForUser(ctx, userId);
  if (existing.length > 0) return false;
  for (const [i, seed] of DEFAULT_BOARD_COLUMNS.entries()) {
    await ctx.db.insert("boardColumns", {
      userId,
      name: seed.name,
      color: seed.color,
      order: i,
      isDone: seed.isDone,
    });
  }
  return true;
}

export function assertValidColor(color: string) {
  if (!isBoardColumnColor(color)) {
    throw new Error("Invalid column color");
  }
}

export function isTaskDone(
  columnId: Id<"boardColumns"> | undefined,
  doneColumnId: Id<"boardColumns"> | undefined,
): boolean {
  return (
    columnId !== undefined &&
    doneColumnId !== undefined &&
    columnId === doneColumnId
  );
}

export function completedAtForMove(
  wasDone: boolean,
  willBeDone: boolean,
  previous: number | undefined,
): number | undefined {
  if (wasDone && willBeDone) return previous;
  if (!wasDone && willBeDone) return Date.now();
  return undefined;
}

export function assertUniqueNames(names: Array<string>) {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error("Column name already exists");
    seen.add(key);
  }
}

export { normalizeColumnName };
