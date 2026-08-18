import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

export const getBlockQuery = internalQuery({
  args: { blockId: v.id("timeBlocks") },
  handler: async (ctx, args) => {
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block) return null;
    const task = block.taskId ? await ctx.db.get("tasks", block.taskId) : null;
    return { ...block, taskTitle: task?.title ?? null };
  },
});
