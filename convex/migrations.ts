import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import { blockReview } from "./schema";
import { listColumnsForUser, seedDefaultColumns } from "./lib/boardColumns";
import { legacyStatusToDefaultName } from "./lib/legacyStatus";

type LegacyBlockFields = {
  taskId?: Id<"tasks">;
  review?: Infer<typeof blockReview>;
};

export type LegacyTimeBlock = {
  _id: Id<"timeBlocks">;
  userId: string;
} & LegacyBlockFields;

export type ExistingMembership = {
  blockId: Id<"timeBlocks">;
  taskId: Id<"tasks">;
};

export function membershipFromLegacyBlock(block: LegacyTimeBlock) {
  const taskId = block.taskId;
  if (!taskId) return null;
  return {
    userId: block.userId,
    blockId: block._id,
    taskId,
    order: 0,
    ...(block.review !== undefined ? { review: block.review } : {}),
  };
}

export type LegacyMembershipInsert = NonNullable<
  ReturnType<typeof membershipFromLegacyBlock>
>;

/** For each block with taskId, skip if a membership exists, else insert. */
export function membershipsToInsertFromLegacyBlocks(
  blocks: LegacyTimeBlock[],
  existing: ExistingMembership[],
): LegacyMembershipInsert[] {
  const existingKeys = new Set(
    existing.map((row) => `${row.blockId}:${row.taskId}`),
  );
  const inserts: LegacyMembershipInsert[] = [];
  for (const block of blocks) {
    const payload = membershipFromLegacyBlock(block);
    if (!payload) continue;
    const key = `${payload.blockId}:${payload.taskId}`;
    if (existingKeys.has(key)) continue;
    inserts.push(payload);
    existingKeys.add(key);
  }
  return inserts;
}

export function omitLegacyTimeBlockFields<
  T extends { _id: unknown; _creationTime?: unknown } & LegacyBlockFields,
>(block: T) {
  const {
    _id: _id,
    _creationTime: _creationTime,
    taskId: _taskId,
    review: _review,
    ...rest
  } = block;
  return rest;
}

export function leftoverLegacyTaskIdWithoutMembership(
  block: LegacyTimeBlock,
  existing: ExistingMembership[],
) {
  const leftoverTaskId = (block as LegacyBlockFields).taskId;
  if (!leftoverTaskId) return false;
  return !existing.some(
    (row) => row.blockId === block._id && row.taskId === leftoverTaskId,
  );
}

export function assertSafeToClearLegacyTimeBlockFields(
  blocks: LegacyTimeBlock[],
  existing: ExistingMembership[],
) {
  for (const block of blocks) {
    if (leftoverLegacyTaskIdWithoutMembership(block, existing)) {
      throw new Error(
        "Cannot clear leftover timeBlocks.taskId without a matching timeBlockTasks row; run backfillTimeBlockTasks first",
      );
    }
  }
}

async function dropScheduledDateHandler(ctx: MutationCtx) {
  const tasks = await ctx.db.query("tasks").collect();
  for (const task of tasks) {
    if (task.scheduledDate !== undefined) {
      await ctx.db.patch("tasks", task._id, { scheduledDate: undefined });
    }
  }
}

/** Run once after schema widen, before schema narrow. */
export const dropScheduledDate = internalMutation({
  args: {},
  handler: async (ctx) => {
    await dropScheduledDateHandler(ctx);
  },
});

/** Public entry point for CLI/dashboard — idempotent, safe to re-run. */
export const migrateLegacyTasks = mutation({
  args: {},
  handler: async (ctx) => {
    await dropScheduledDateHandler(ctx);
  },
});

async function backfillTimeBlockTasksHandler(ctx: MutationCtx) {
  const blocks = await ctx.db.query("timeBlocks").collect();
  const existing = await ctx.db.query("timeBlockTasks").collect();
  const payloads = membershipsToInsertFromLegacyBlocks(
    blocks as Array<(typeof blocks)[number] & LegacyBlockFields>,
    existing,
  );
  for (const payload of payloads) {
    await ctx.db.insert("timeBlockTasks", payload);
  }
}

/** Copy leftover timeBlocks.taskId/review onto timeBlockTasks. Safe to re-run.
 * Run order: backfill → verify → clear. Do not invert. */
export const backfillTimeBlockTasks = mutation({
  args: {},
  handler: async (ctx) => {
    await backfillTimeBlockTasksHandler(ctx);
  },
});

/** Strip leftover taskId/review from timeBlocks after backfill.
 * Run order: backfill → verify → clear. Do not invert. */
export const clearLegacyTimeBlockTaskFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const blocks = await ctx.db.query("timeBlocks").collect();
    const existing = await ctx.db.query("timeBlockTasks").collect();
    const leftoverBlocks = blocks as Array<
      (typeof blocks)[number] & LegacyBlockFields
    >;
    assertSafeToClearLegacyTimeBlockFields(leftoverBlocks, existing);
    for (const block of leftoverBlocks) {
      const rest = omitLegacyTimeBlockFields(block);
      await ctx.db.replace("timeBlocks", block._id, rest);
    }
  },
});

export async function backfillBoardColumnsForUsers(ctx: MutationCtx): Promise<{
  users: number;
  tasks: number;
}> {
  const tasks = await ctx.db.query("tasks").collect();
  const columns = await ctx.db.query("boardColumns").collect();
  const userIds = new Set<string>();
  for (const task of tasks) userIds.add(task.userId);
  for (const column of columns) userIds.add(column.userId);
  let patched = 0;
  for (const userId of userIds) {
    await seedDefaultColumns(ctx, userId);
    const seeded = await listColumnsForUser(ctx, userId);
    const byName = new Map(seeded.map((c) => [c.name, c._id]));
    const userTasks = tasks.filter((task) => task.userId === userId);
    for (const task of userTasks) {
      if (task.columnId !== undefined) continue;
      const name = legacyStatusToDefaultName(task.status);
      if (!name) continue;
      const columnId = byName.get(name);
      if (columnId) {
        await ctx.db.patch("tasks", task._id, { columnId });
        patched += 1;
      }
    }
  }
  return { users: userIds.size, tasks: patched };
}

/** Public entry point for CLI/dashboard — idempotent, safe to re-run. */
export const backfillBoardColumns = mutation({
  args: {},
  handler: async (ctx) => {
    await backfillBoardColumnsForUsers(ctx);
  },
});

