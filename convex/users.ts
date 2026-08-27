import { query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const googleAccount = await ctx.db
      .query("googleAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return {
      googleConnected: googleAccount !== null,
    };
  },
});
