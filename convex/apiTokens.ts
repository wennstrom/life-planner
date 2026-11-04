import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { apiTokenScope } from "./schema";
import { requireUserId } from "./lib/auth";
import {
  displayPrefix,
  generateToken,
  hashToken,
  isTokenActive,
} from "./lib/mcpAuth";
import { DAY_MS } from "./lib/dates";
import type { Id } from "./_generated/dataModel";

export const MAX_ACTIVE_TOKENS = 20;
export const TOKEN_NAME_MAX_LENGTH = 60;
/** Most tokens `list` returns, newest first. Revoked ones are included. */
export const TOKEN_LIST_LIMIT = 100;
/** Most token rows read when counting a user's active tokens. */
const ACTIVE_TOKEN_SCAN_CAP = 1000;

const expiresInDays = v.union(v.literal(30), v.literal(90), v.null());

/**
 * Creates a personal access token and returns its plaintext. This is the only
 * time the plaintext exists outside the agent's config: only its hash is
 * stored. An action, because mutations don't get real randomness.
 */
export const create = action({
  args: {
    name: v.string(),
    scope: apiTokenScope,
    expiresInDays,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ tokenId: Id<"apiTokens">; token: string }> => {
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const tokenId: Id<"apiTokens"> = await ctx.runMutation(
      internal.apiTokens.insert,
      {
        name: args.name,
        scope: args.scope,
        expiresInDays: args.expiresInDays,
        tokenHash,
        prefix: displayPrefix(token),
      },
    );
    return { tokenId, token };
  },
});

/** Stores a new token for the signed-in user. Called only by `create`. */
export const insert = internalMutation({
  args: {
    name: v.string(),
    scope: apiTokenScope,
    expiresInDays,
    tokenHash: v.string(),
    prefix: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = args.name.trim();
    if (name.length === 0) throw new Error("Name the token");
    if (name.length > TOKEN_NAME_MAX_LENGTH) {
      throw new Error("Token name is too long");
    }

    const now = Date.now();
    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(ACTIVE_TOKEN_SCAN_CAP);
    const active = tokens.filter((token) => isTokenActive(token, now));
    if (active.length >= MAX_ACTIVE_TOKENS) {
      throw new Error(
        `You can have at most ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`,
      );
    }

    return await ctx.db.insert("apiTokens", {
      userId,
      name,
      tokenHash: args.tokenHash,
      prefix: args.prefix,
      scope: args.scope,
      expiresAt:
        args.expiresInDays === null
          ? undefined
          : now + args.expiresInDays * DAY_MS,
    });
  },
});

/**
 * The user's tokens, newest first. Never returns the hash. Clients compare
 * `expiresAt` to their own clock: a query can't read the wall clock.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(TOKEN_LIST_LIMIT);
    return tokens.map((token) => ({
      _id: token._id,
      name: token.name,
      prefix: token.prefix,
      scope: token.scope,
      createdAt: token._creationTime,
      lastUsedAt: token.lastUsedAt ?? null,
      expiresAt: token.expiresAt ?? null,
      revokedAt: token.revokedAt ?? null,
    }));
  },
});

export const revoke = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const token = await ctx.db.get("apiTokens", args.tokenId);
    if (!token || token.userId !== userId) {
      throw new Error("Token not found");
    }
    if (token.revokedAt !== undefined) return;
    await ctx.db.patch("apiTokens", args.tokenId, { revokedAt: Date.now() });
  },
});
