import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

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
