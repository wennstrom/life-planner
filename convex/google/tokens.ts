"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getGoogleCalendarClient } from "./client";

export const getValidAccessToken = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<string | null> => {
    const account = await ctx.runQuery(internal.google.accounts.getByUser, {
      userId: args.userId,
    });
    if (!account) {
      return null;
    }

    const now = Date.now();
    if (account.tokenExpiry && account.tokenExpiry > now + 60_000) {
      return account.accessToken;
    }

    if (!account.refreshToken) {
      return account.accessToken;
    }

    const client = getGoogleCalendarClient(account.accessToken);
    const refreshed = await client.refreshAccessToken(account.refreshToken);

    await ctx.runMutation(internal.google.accounts.updateTokens, {
      accountId: account._id,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? account.refreshToken,
      tokenExpiry: refreshed.expiryMs,
    });

    return refreshed.accessToken;
  },
});
