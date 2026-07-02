import type { GenericId } from "convex/values";
import type { GenericMutationCtx } from "convex/server";
import { internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";

type OAuthProvider = {
  id: string;
  type?: string;
  allowDangerousEmailAccountLinking?: boolean;
};

type CreateOrUpdateUserArgs = {
  type: "oauth" | "credentials" | "email" | "phone" | "verification";
  provider: OAuthProvider;
  profile: Record<string, unknown> & {
    email?: string;
    phone?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  };
  shouldLinkViaEmail?: boolean;
  shouldLinkViaPhone?: boolean;
};

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

async function uniqueUserWithVerifiedEmail(
  ctx: GenericMutationCtx<DataModel>,
  email: string,
) {
  const users = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
    .take(2);
  return users.length === 1 ? users[0] : null;
}

async function uniqueUserWithVerifiedPhone(
  ctx: GenericMutationCtx<DataModel>,
  phone: string,
) {
  const users = await ctx.db
    .query("users")
    .withIndex("phone", (q) => q.eq("phone", phone))
    .filter((q) => q.neq(q.field("phoneVerificationTime"), undefined))
    .take(2);
  return users.length === 1 ? users[0] : null;
}

/**
 * Convex Auth default user creation, with Google OAuth tokens stripped from the
 * profile before writing to `users` and persisted to `googleAccounts` instead.
 */
export async function createOrUpdateOAuthUser(
  ctx: GenericMutationCtx<DataModel>,
  existingUserId: GenericId<"users"> | null,
  args: CreateOrUpdateUserArgs,
): Promise<GenericId<"users">> {
  const googleTokens =
    args.provider.id === "google" ? extractGoogleTokens(args.profile) : null;
  const cleanedProfile = googleTokens
    ? stripGoogleTokenFields(args.profile)
    : args.profile;

  const {
    emailVerified: profileEmailVerified,
    phoneVerified: profilePhoneVerified,
    ...profileFields
  } = cleanedProfile;

  const { provider } = args;
  const emailVerified =
    profileEmailVerified ??
    ((provider.type === "oauth" || provider.type === "oidc") &&
      provider.allowDangerousEmailAccountLinking !== false);
  const phoneVerified = profilePhoneVerified ?? false;
  const shouldLinkViaEmail =
    args.shouldLinkViaEmail || emailVerified || provider.type === "email";
  const shouldLinkViaPhone =
    args.shouldLinkViaPhone || phoneVerified || provider.type === "phone";

  let userId = existingUserId;
  if (existingUserId === null) {
    const existingUserWithVerifiedEmailId =
      typeof profileFields.email === "string" && shouldLinkViaEmail
        ? (await uniqueUserWithVerifiedEmail(ctx, profileFields.email))?._id ??
          null
        : null;

    const existingUserWithVerifiedPhoneId =
      typeof profileFields.phone === "string" && shouldLinkViaPhone
        ? (await uniqueUserWithVerifiedPhone(ctx, profileFields.phone))?._id ??
          null
        : null;

    if (
      existingUserWithVerifiedEmailId !== null &&
      existingUserWithVerifiedPhoneId !== null
    ) {
      userId = null;
    } else if (existingUserWithVerifiedEmailId !== null) {
      userId = existingUserWithVerifiedEmailId;
    } else if (existingUserWithVerifiedPhoneId !== null) {
      userId = existingUserWithVerifiedPhoneId;
    } else {
      userId = null;
    }
  }

  const userData = {
    ...(emailVerified ? { emailVerificationTime: Date.now() } : null),
    ...(phoneVerified ? { phoneVerificationTime: Date.now() } : null),
    ...profileFields,
  };

  if (userId !== null) {
    await ctx.db.patch(userId, userData);
  } else {
    userId = await ctx.db.insert("users", userData);
  }

  if (googleTokens) {
    await upsertGoogleAccountTokens(ctx, userId, googleTokens);
    await ctx.scheduler.runAfter(0, internal.google.inbound.syncUser, {
      userId,
    });
  }

  return userId;
}
