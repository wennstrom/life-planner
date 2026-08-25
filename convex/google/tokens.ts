"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getGoogleCalendarClient, isGoogleCalendarClientMocked } from "./client";
import {
  nextGoogleTokenAction,
  tokenInfoIndicatesCalendar,
  type GoogleScopeStatus,
} from "./tokenDecision";

const CALENDAR_SCOPE_HINT = "https://www.googleapis.com/auth/calendar";

async function fetchScopeStatus(accessToken: string): Promise<GoogleScopeStatus> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken }),
    });
    const data = (await res.json()) as { scope?: string; error?: string };
    const status = tokenInfoIndicatesCalendar({ ok: res.ok, scope: data.scope });
    if (status !== "has_calendar") {
      console.error(
        `Google tokeninfo calendar check: http=${res.status} status=${status} scope=${data.scope ?? "(none)"} error=${data.error ?? ""}`,
      );
    }
    return status;
  } catch (error) {
    console.error("Google tokeninfo request failed", error);
    return "unknown";
  }
}

function logMissingCalendarScope(userId: string) {
  console.error(
    `Google access token for user ${userId} is missing calendar scope (${CALENDAR_SCOPE_HINT}). Revoke app access at https://myaccount.google.com/permissions and sign in again.`,
  );
}

export const getValidAccessToken = internalAction({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const account = await ctx.runQuery(internal.google.accounts.getByUser, {
      userId: args.userId,
    });
    if (!account) {
      return null;
    }

    let accessToken = account.accessToken;
    let refreshToken = account.refreshToken;
    let tokenExpiry = account.tokenExpiry;
    let alreadyRefreshed = false;
    let knownScope: string | undefined;

    while (true) {
      const scopeStatus: GoogleScopeStatus = isGoogleCalendarClientMocked()
        ? "has_calendar"
        : knownScope !== undefined
          ? tokenInfoIndicatesCalendar({ ok: true, scope: knownScope })
          : await fetchScopeStatus(accessToken);

      const action = nextGoogleTokenAction({
        now: Date.now(),
        tokenExpiry,
        hasRefreshToken: Boolean(refreshToken),
        alreadyRefreshed,
        scopeStatus,
      });

      if (action === "use") {
        return accessToken;
      }

      if (action === "fail_missing_scope") {
        logMissingCalendarScope(args.userId);
        return null;
      }

      const client = getGoogleCalendarClient(accessToken);
      const refreshed = await client.refreshAccessToken(refreshToken!);
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken ?? refreshToken;
      tokenExpiry = refreshed.expiryMs;
      knownScope = refreshed.scope;
      alreadyRefreshed = true;

      await ctx.runMutation(internal.google.accounts.updateTokens, {
        accountId: account._id,
        accessToken,
        refreshToken,
        tokenExpiry,
      });
    }
  },
});
