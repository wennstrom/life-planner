import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { getUserSettings, isValidTimezone } from "./lib/userSettings";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const settings = await getUserSettings(ctx, userId);
    return { timezone: settings?.timezone ?? null };
  },
});

/** Stores the browser's IANA zone. Does nothing if it hasn't changed. */
export const setTimezone = mutation({
  args: { timezone: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!isValidTimezone(args.timezone)) {
      throw new Error("Invalid timezone");
    }

    const existing = await getUserSettings(ctx, userId);
    if (existing === null) {
      await ctx.db.insert("userSettings", {
        userId,
        timezone: args.timezone,
        updatedAt: Date.now(),
      });
      return;
    }
    if (existing.timezone === args.timezone) return;
    await ctx.db.patch("userSettings", existing._id, {
      timezone: args.timezone,
      updatedAt: Date.now(),
    });
  },
});
