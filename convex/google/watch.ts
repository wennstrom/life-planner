"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getGoogleCalendarClient } from "./client";

export const renewAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.runQuery(internal.google.accounts.listAll);
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) {
      return;
    }

    for (const account of accounts) {
      const expiresSoon =
        !account.watchExpiry || account.watchExpiry < Date.now() + 24 * 60 * 60 * 1000;
      if (!expiresSoon) {
        continue;
      }

      const accessToken = await ctx.runAction(
        internal.google.tokens.getValidAccessToken,
        { userId: account.userId },
      );
      if (!accessToken) {
        continue;
      }

      const channelId = crypto.randomUUID();
      const expirationMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const client = getGoogleCalendarClient(accessToken);
      const watch = await client.watch({
        channelId,
        address: `${siteUrl}/google/calendar/push`,
        expirationMs,
      });

      await ctx.runMutation(internal.google.accounts.updateWatchChannel, {
        accountId: account._id,
        watchChannelId: channelId,
        watchResourceId: watch.resourceId,
        watchExpiry: watch.expiration,
      });
    }
  },
});

export const handlePush = internalAction({
  args: {
    channelId: v.optional(v.string()),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const accounts = await ctx.runQuery(internal.google.accounts.listAll);
    const account = accounts.find(
      (a: { watchChannelId?: string; watchResourceId?: string }) =>
        a.watchChannelId === args.channelId ||
        a.watchResourceId === args.resourceId,
    );
    if (!account) {
      return;
    }

    await ctx.runAction(internal.google.inbound.syncUser, {
      userId: account.userId,
    });
  },
});
