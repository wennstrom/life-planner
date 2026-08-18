import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

async function dropScheduledDateHandler(ctx: MutationCtx) {
  const tasks = await ctx.db.query("tasks").collect();
  for (const task of tasks) {
    const patch: Record<string, unknown> = {};
    if (task.status === "today") {
      patch.status = "backlog";
    }
    if (task.scheduledDate !== undefined) {
      patch.scheduledDate = undefined;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("tasks", task._id, patch);
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
