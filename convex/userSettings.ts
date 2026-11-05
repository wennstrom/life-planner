import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  agentsCanMarkDone,
  getUserSettings,
  isValidTimezone,
  patchUserSettings,
} from "./lib/userSettings";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const settings = await getUserSettings(ctx, userId);
    return {
      timezone: settings?.timezone ?? null,
      agentsCanMarkDone: agentsCanMarkDone(settings),
    };
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
    if (existing?.timezone === args.timezone) return;
    await patchUserSettings(ctx, userId, { timezone: args.timezone });
  },
});

/** Lets (or stops) MCP agents moving tasks to the done column. */
export const setAgentsCanMarkDone = mutation({
  args: { value: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await patchUserSettings(ctx, userId, { agentsCanMarkDone: args.value });
    return null;
  },
});
