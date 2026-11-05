import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  TokenRejectedError,
  findTokenByHash,
  isTokenActive,
  requireToken,
} from "../lib/mcpAuth";
import {
  INVALID_SESSION_ID_ERROR,
  effectiveSessionId,
  isValidSessionId,
} from "../lib/agentSession";
import { agentsCanMarkDone, getUserSettings } from "../lib/userSettings";
import { logActivity } from "./activity";
import { handlers } from "./handlers";
import { mcpRateLimiter } from "./rateLimits";
import { formatInputError, isToolName, toolInputs, toolMeta } from "./toolDefs";
import type { RateBucket, ToolName } from "./toolDefs";
import type { ToolOutput, ToolUser } from "./handlers";
import type { TokenScope } from "../lib/mcpAuth";

// Every MCP tool call runs through `call`, one transaction per call:
//
//   1. check the token and its scope
//   2. charge the rate limits
//   3. run the tool in a nested mutation (`execute`)
//   4. write one mcpActivity row
//
// Expected failures (bad arguments, "Task not found", a read-only block) come
// back from `execute` as a ConvexError. The nested mutation's writes roll back,
// but the rate-limit charge and the activity row still commit. Anything else
// throws out of `call` and rolls the whole call back.

/** Write `lastUsedAt` at most this often, so reads don't rewrite the token. */
const LAST_USED_RESOLUTION_MS = 60_000;

const BUCKET_LABEL: Record<RateBucket, string> = {
  read: "reads (300 a minute)",
  write: "writes (60 a minute)",
  calendar: "calendar changes (100 a day)",
};

export type ToolCallOutcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: string; retryAfterMs?: number };

type ToolErrorData = { kind: "toolError"; message: string };

function isToolErrorData(data: unknown): data is ToolErrorData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { kind?: unknown }).kind === "toolError" &&
    typeof (data as { message?: unknown }).message === "string"
  );
}

/**
 * Errors the business rules throw on purpose (`new Error("Task not found")`)
 * are shown to the agent. Other error types (TypeError and friends) are bugs.
 */
function isExpectedError(error: unknown): error is Error {
  return (
    error instanceof ConvexError ||
    (error instanceof Error && error.constructor === Error)
  );
}

function errorMessage(error: Error): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error.message;
}

/** IDs named in the raw arguments, for the log row of a failed call. */
function idsInInput(input: unknown): Array<string> {
  if (typeof input !== "object" || input === null) return [];
  const ids: Array<string> = [];
  for (const key of ["taskId", "blockId"]) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length <= 64) ids.push(value);
  }
  return ids;
}

/** The scope of an active token, or null. For the HTTP layer's 401 check. */
export const tokenScope = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  handler: async (ctx, args): Promise<TokenScope | null> => {
    const token = await findTokenByHash(ctx, args.tokenHash);
    if (!token || !isTokenActive(token, args.now)) return null;
    return token.scope;
  },
});

export const call = internalMutation({
  args: {
    tokenHash: v.string(),
    tool: v.string(),
    input: v.any(),
    /** The X-Agent-Session header, already checked by the HTTP layer. */
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ToolCallOutcome> => {
    if (args.sessionId !== undefined && !isValidSessionId(args.sessionId)) {
      return { ok: false, error: INVALID_SESSION_ID_ERROR };
    }
    const sessionId = effectiveSessionId(args.input, args.sessionId);
    if (!isToolName(args.tool)) {
      return { ok: false, error: `Unknown tool: ${args.tool}` };
    }
    const tool: ToolName = args.tool;
    const meta = toolMeta[tool];
    const now = Date.now();

    let auth;
    try {
      auth = await requireToken(ctx, args.tokenHash, meta.scope, now);
    } catch (error) {
      if (!(error instanceof TokenRejectedError)) throw error;
      if (error.token) {
        await logActivity(ctx, {
          ...error.token,
          sessionId,
          tool,
          ok: false,
          summary: error.message,
          targetIds: idsInInput(args.input),
        });
      }
      return { ok: false, error: error.message };
    }
    const { userId, tokenId, token } = auth;
    const agent = token.name;

    if (
      token.lastUsedAt === undefined ||
      now - token.lastUsedAt >= LAST_USED_RESOLUTION_MS
    ) {
      await ctx.db.patch("apiTokens", tokenId, { lastUsedAt: now });
    }

    const fail = async (error: string, retryAfterMs?: number) => {
      await logActivity(ctx, {
        userId,
        tokenId,
        agent,
        sessionId,
        tool,
        ok: false,
        summary: error,
        targetIds: idsInInput(args.input),
      });
      return retryAfterMs === undefined
        ? { ok: false as const, error }
        : { ok: false as const, error, retryAfterMs };
    };

    // Check every bucket before charging any, so a call refused by the daily
    // calendar cap doesn't also use up a write.
    for (const bucket of meta.buckets) {
      const status = await mcpRateLimiter.check(ctx, bucket, { key: tokenId });
      if (!status.ok) {
        const seconds = Math.max(1, Math.ceil(status.retryAfter / 1000));
        return await fail(
          `Rate limit reached for ${BUCKET_LABEL[bucket]}. Retry after ${seconds} seconds.`,
          status.retryAfter,
        );
      }
    }
    for (const bucket of meta.buckets) {
      await mcpRateLimiter.limit(ctx, bucket, { key: tokenId });
    }

    let output: ToolOutput;
    try {
      output = await ctx.runMutation(internal.mcp.tools.execute, {
        userId,
        tokenId,
        agent,
        sessionId,
        tool,
        input: args.input,
      });
    } catch (error) {
      if (error instanceof ConvexError && isToolErrorData(error.data)) {
        return await fail(error.data.message);
      }
      throw error;
    }

    await logActivity(ctx, {
      userId,
      tokenId,
      agent,
      sessionId,
      tool,
      ok: true,
      summary: output.summary,
      targetIds: output.targetIds,
    });
    return { ok: true, result: output.result };
  },
});

/**
 * Validates the arguments and runs one tool for a user `call` has already
 * authenticated. Internal and only called from `call`, as a nested
 * transaction so a failed tool leaves no partial writes behind.
 */
export const execute = internalMutation({
  args: {
    userId: v.string(),
    tokenId: v.id("apiTokens"),
    agent: v.string(),
    sessionId: v.optional(v.string()),
    tool: v.string(),
    input: v.any(),
  },
  handler: async (ctx, args): Promise<ToolOutput> => {
    try {
      if (!isToolName(args.tool)) throw new Error(`Unknown tool: ${args.tool}`);
      const parsed = toolInputs[args.tool].safeParse(args.input ?? {});
      if (!parsed.success) throw new Error(formatInputError(parsed.error));

      const settings = await getUserSettings(ctx, args.userId);
      const user: ToolUser = {
        userId: args.userId,
        timezone: settings?.timezone ?? null,
        agentsCanMarkDone: agentsCanMarkDone(settings),
        caller: {
          tokenId: args.tokenId,
          agent: args.agent,
          sessionId: args.sessionId,
        },
      };
      const handler = handlers[args.tool] as (
        ...params: [typeof ctx, typeof user, typeof parsed.data]
      ) => Promise<ToolOutput>;
      const output = await handler(ctx, user, parsed.data);
      // Drop `undefined` fields so the result is a plain JSON value.
      return JSON.parse(JSON.stringify(output)) as ToolOutput;
    } catch (error) {
      if (isExpectedError(error)) {
        const data: ToolErrorData = {
          kind: "toolError",
          message: errorMessage(error),
        };
        throw new ConvexError(data);
      }
      throw error;
    }
  },
});
