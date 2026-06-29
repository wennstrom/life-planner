import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

export const getBlockQuery = internalQuery({
  args: { blockId: v.id("timeBlocks") },
  handler: async (ctx, args) => {
    return await ctx.db.get("timeBlocks", args.blockId);
  },
});
