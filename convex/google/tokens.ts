"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getGoogleCalendarClient, isGoogleCalendarClientMocked } from "./client";

const CALENDAR_SCOPE_HINT =
  "https://www.googleapis.com/auth/calendar";

async function accessTokenHasCalendarScope(accessToken: string) {
  const res = await fetch(
    `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!res.ok) {
    return false;
  }
  const data = (await res.json()) as { scope?: string };
  const scopes = data.scope?.split(" ") ?? [];
  return scopes.some((scope) => scope.includes("calendar"));
}

async function ensureCalendarScope(userId: string, accessToken: string) {
  if (isGoogleCalendarClientMocked()) {
    return true;
  }
  if (await accessTokenHasCalendarScope(accessToken)) {
    return true;
  }
  console.error(
    `Google access token for user ${userId} is missing calendar scope (${CALENDAR_SCOPE_HINT}). Revoke app access at https://myaccount.google.com/permissions and sign in again.`,
  );
  return false;
}

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
      if (await ensureCalendarScope(args.userId, account.accessToken)) {
        return account.accessToken;
      }
      return null;
    }

    if (!account.refreshToken) {
      if (await ensureCalendarScope(args.userId, account.accessToken)) {
        return account.accessToken;
      }
      return null;
    }

    const client = getGoogleCalendarClient(account.accessToken);
    const refreshed = await client.refreshAccessToken(account.refreshToken);

    if (!(await ensureCalendarScope(args.userId, refreshed.accessToken))) {
      return null;
    }

    await ctx.runMutation(internal.google.accounts.updateTokens, {
      accountId: account._id,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? account.refreshToken,
      tokenExpiry: refreshed.expiryMs,
    });

    return refreshed.accessToken;
  },
});
