"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getGoogleCalendarClient } from "./client";

export const syncUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const account = await ctx.runQuery(internal.google.accounts.getByUser, {
      userId: args.userId,
    });
    if (!account) {
      return;
    }

    const accessToken = await ctx.runAction(
      internal.google.tokens.getValidAccessToken,
      { userId: args.userId },
    );
    if (!accessToken) {
      return;
    }

    const client = getGoogleCalendarClient(accessToken);
    const { events, nextSyncToken } = await client.listChanges({
      syncToken: account.calendarSyncToken,
      timeMin: account.calendarSyncToken
        ? undefined
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    for (const event of events) {
      await ctx.runMutation(internal.google.inboundMutations.applyEvent, {
        userId: args.userId,
        event,
      });
    }

    if (nextSyncToken) {
      await ctx.runMutation(internal.google.accounts.updateSyncToken, {
        accountId: account._id,
        calendarSyncToken: nextSyncToken,
      });
    }
  },
});

export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.runQuery(internal.google.accounts.listAll);
    for (const account of accounts) {
      await ctx.runAction(internal.google.inbound.syncUser, {
        userId: account.userId,
      });
    }
  },
});
