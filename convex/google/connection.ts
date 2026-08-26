import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { requireUserId } from "../lib/auth";

export const markConnected = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("googleAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!existing) {
      await ctx.db.insert("googleAccounts", { userId });
    }

    await ctx.scheduler.runAfter(0, internal.google.inbound.syncUser, {
      userId,
    });
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("googleAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!existing) {
      return;
    }
    // Best-effort: schedule watch stop if you already have an internal helper;
    // otherwise delete metadata and let watch expiry / push no-ops handle it.
    await ctx.db.delete("googleAccounts", existing._id);
  },
});
