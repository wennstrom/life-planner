"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { fetchClerkGoogleAccessToken } from "./clerkTokens";
import { isGoogleCalendarClientMocked } from "./client";
import {
  GOOGLE_CALENDAR_SCOPE,
  clerkTokenUsable,
  tokenInfoIndicatesCalendar,
} from "./tokenDecision";
import type { GoogleScopeStatus } from "./tokenDecision";

async function fetchScopeStatus(accessToken: string): Promise<GoogleScopeStatus> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken }),
    });
    const data = (await res.json()) as { scope?: string };
    return tokenInfoIndicatesCalendar({ ok: res.ok, scope: data.scope });
  } catch {
    return "unknown";
  }
}

export const getValidAccessToken = internalAction({
  args: { userId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    // Still require a googleAccounts metadata row (set on Connect)
    const account = await ctx.runQuery(internal.google.accounts.getByUser, {
      userId: args.userId,
    });
    if (!account) {
      return null;
    }

    if (isGoogleCalendarClientMocked()) {
      return "mock-access-token";
    }

    const clerkToken = await fetchClerkGoogleAccessToken(args.userId);
    if (!clerkToken) {
      return null;
    }

    const tokenInfoStatus = await fetchScopeStatus(clerkToken.token);
    const decision = clerkTokenUsable({
      clerkScopes: clerkToken.scopes,
      tokenInfoStatus,
    });

    if (decision === "fail_missing_scope") {
      console.error(
        `Google access token for user ${args.userId} is missing calendar scope (${GOOGLE_CALENDAR_SCOPE}). Reconnect Google Calendar in the app.`,
      );
      return null;
    }

    return clerkToken.token;
  },
});
