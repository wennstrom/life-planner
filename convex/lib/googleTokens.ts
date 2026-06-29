import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";

type TokenPayload = {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
};

export async function upsertGoogleAccountTokens(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
  tokens: TokenPayload,
) {
  if (!tokens.accessToken) {
    return;
  }

  const existing = await ctx.db
    .query("googleAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const patch = {
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken !== undefined
      ? { refreshToken: tokens.refreshToken }
      : {}),
    ...(tokens.tokenExpiry !== undefined
      ? { tokenExpiry: tokens.tokenExpiry }
      : {}),
  };

  if (existing) {
    await ctx.db.patch("googleAccounts", existing._id, patch);
  } else {
    await ctx.db.insert("googleAccounts", {
      userId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: tokens.tokenExpiry,
    });
  }
}

export function extractGoogleTokens(profile: Record<string, unknown>) {
  return {
    accessToken: profile._googleAccessToken as string | undefined,
    refreshToken: profile._googleRefreshToken as string | undefined,
    tokenExpiry: profile._googleExpiresAt as number | undefined,
  };
}

export function stripGoogleTokenFields(profile: Record<string, unknown>) {
  const {
    _googleAccessToken: _a,
    _googleRefreshToken: _r,
    _googleExpiresAt: _e,
    ...clean
  } = profile;
  return clean;
}
