import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import { blockReview } from "./schema";

type LegacyBlockFields = {
  taskId?: Id<"tasks">;
  review?: Infer<typeof blockReview>;
};

export function membershipFromLegacyBlock(block: {
  _id: Id<"timeBlocks">;
  userId: string;
} & LegacyBlockFields) {
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

/** Copy legacy timeBlocks.taskId/review onto timeBlockTasks. Safe to re-run. */
export const backfillTimeBlockTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const blocks = await ctx.db.query("timeBlocks").collect();
    for (const block of blocks) {
      const payload = membershipFromLegacyBlock(
        block as typeof block & LegacyBlockFields,
      );
      if (!payload) continue;

      const existing = await ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", block._id))
        .collect();
      if (existing.some((row) => row.taskId === payload.taskId)) continue;

      await ctx.db.insert("timeBlockTasks", payload);
    }
  },
});

/** Strip legacy taskId/review from timeBlocks after backfill. */
export const clearLegacyTimeBlockTaskFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const blocks = await ctx.db.query("timeBlocks").collect();
    for (const block of blocks) {
      const {
        _id: _id,
        _creationTime: _creationTime,
        taskId: _taskId,
        review: _review,
        ...rest
      } = block as typeof block & LegacyBlockFields;
      await ctx.db.replace("timeBlocks", block._id, rest);
    }
  },
});
