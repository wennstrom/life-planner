import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const getByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const updateTokens = internalMutation({
  args: {
    accountId: v.id("googleAccounts"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("googleAccounts", args.accountId, {
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiry: args.tokenExpiry,
    });
  },
});

export const updateSyncToken = internalMutation({
  args: {
    accountId: v.id("googleAccounts"),
    calendarSyncToken: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("googleAccounts", args.accountId, {
      calendarSyncToken: args.calendarSyncToken,
    });
  },
});

export const updateWatchChannel = internalMutation({
  args: {
    accountId: v.id("googleAccounts"),
    watchChannelId: v.string(),
    watchResourceId: v.string(),
    watchExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("googleAccounts", args.accountId, {
      watchChannelId: args.watchChannelId,
      watchResourceId: args.watchResourceId,
      watchExpiry: args.watchExpiry,
    });
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("googleAccounts").collect();
  },
});
