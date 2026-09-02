import {
  DEFAULT_BOARD_COLUMNS,
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

export function assertUniqueNames(names: Array<string>) {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error("Column name already exists");
    seen.add(key);
  }
}

export { normalizeColumnName };
