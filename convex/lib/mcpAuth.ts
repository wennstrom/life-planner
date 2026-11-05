import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Authentication for the MCP server. Today the only credential is a personal
// access token. OAuth (for claude.ai and mobile connectors) can be added in
// `resolveUserFromRequest` without touching the tools.

export const TOKEN_PREFIX = "lp_";
/** 32 random bytes in base64url. */
const TOKEN_BODY_LENGTH = 43;
const TOKEN_PATTERN = /^lp_[A-Za-z0-9_-]{43}$/;
export const TOKEN_DISPLAY_PREFIX_LENGTH = 8;

export type TokenScope = Doc<"apiTokens">["scope"];
export type NeededScope = "read" | "write";

export function isWellFormedToken(raw: string): boolean {
  return TOKEN_PATTERN.test(raw);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A new random token. Call from an action: it needs real randomness. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = TOKEN_PREFIX + base64url(bytes);
  if (token.length !== TOKEN_PREFIX.length + TOKEN_BODY_LENGTH) {
    throw new Error("Token generation failed");
  }
  return token;
}

export function displayPrefix(raw: string): string {
  return raw.slice(
    TOKEN_PREFIX.length,
    TOKEN_PREFIX.length + TOKEN_DISPLAY_PREFIX_LENGTH,
  );
}

/** Hex SHA-256 of the full token string. */
export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * The credential on an MCP request, or null if there is none or it is
 * malformed. Only checks the format; the tools check the token itself in the
 * same transaction as their writes.
 */
export async function resolveUserFromRequest(
  request: Request,
): Promise<{ tokenHash: string } | null> {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match || !isWellFormedToken(match[1])) return null;
  return { tokenHash: await hashToken(match[1]) };
}

export function scopeAllows(scope: TokenScope, needed: NeededScope): boolean {
  return needed === "read" || scope === "read_write";
}

export function isTokenActive(token: Doc<"apiTokens">, now: number): boolean {
  if (token.revokedAt !== undefined) return false;
  return token.expiresAt === undefined || token.expiresAt > now;
}

export async function findTokenByHash(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string,
): Promise<Doc<"apiTokens"> | null> {
  return await ctx.db
    .query("apiTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
}

/** A token that exists but can't be used for this call. */
export class TokenRejectedError extends Error {
  constructor(
    message: string,
    /** Set when the token is valid but lacks the scope, so the call is logged. */
    readonly token?: {
      tokenId: Id<"apiTokens">;
      userId: string;
      agent: string;
    },
  ) {
    super(message);
    this.name = "TokenRejectedError";
  }
}

/**
 * Checks the token exists, isn't revoked or expired and has the scope the
 * tool needs. Throws `TokenRejectedError` otherwise.
 */
export async function requireToken(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string,
  needed: NeededScope,
  now: number,
): Promise<{ userId: string; tokenId: Id<"apiTokens">; token: Doc<"apiTokens"> }> {
  const token = await findTokenByHash(ctx, tokenHash);
  if (!token || !isTokenActive(token, now)) {
    throw new TokenRejectedError("Invalid, revoked or expired token");
  }
  if (!scopeAllows(token.scope, needed)) {
    throw new TokenRejectedError(
      "This token is read-only. Create a read & write token in Life Planner settings to make changes.",
      { tokenId: token._id, userId: token.userId, agent: token.name },
    );
  }
  return { userId: token.userId, tokenId: token._id, token };
}
