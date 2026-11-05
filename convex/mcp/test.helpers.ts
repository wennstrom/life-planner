/// <reference types="vite/client" />
// Shared setup for the MCP tests. The extra dot in the file name keeps Convex
// from deploying it, like test.setup.ts.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../schema";
import { internal } from "../_generated/api";
import { modules } from "../test.setup";
import {
  displayPrefix,
  generateToken,
  hashToken,
} from "../lib/mcpAuth";
import type { TestConvex } from "convex-test";
import type { Id } from "../_generated/dataModel";
import type { ToolCallOutcome } from "./tools";

export type McpTest = TestConvex<typeof schema>;

export function setupMcp() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

export type TestToken = {
  token: string;
  tokenHash: string;
  tokenId: Id<"apiTokens">;
  userId: string;
};

export async function insertToken(
  t: McpTest,
  options: {
    userId?: string;
    scope?: "read" | "read_write";
    expiresAt?: number;
    revokedAt?: number;
    timezone?: string | null;
  } = {},
): Promise<TestToken> {
  const userId = options.userId ?? "user_alice";
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const timezone =
    options.timezone === undefined ? "Europe/Stockholm" : options.timezone;
  const tokenId = await t.run(async (ctx) => {
    if (timezone !== null) {
      const existing = await ctx.db
        .query("userSettings")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (!existing) {
        await ctx.db.insert("userSettings", {
          userId,
          timezone,
          updatedAt: Date.now(),
        });
      }
    }
    return await ctx.db.insert("apiTokens", {
      userId,
      name: "Test token",
      tokenHash,
      prefix: displayPrefix(token),
      scope: options.scope ?? "read_write",
      expiresAt: options.expiresAt,
      revokedAt: options.revokedAt,
    });
  });
  return { token, tokenHash, tokenId, userId };
}

/** Calls a tool through the internal mutation, skipping HTTP. */
export async function callTool(
  t: McpTest,
  token: TestToken,
  tool: string,
  input: Record<string, unknown> = {},
  options: { sessionId?: string } = {},
): Promise<ToolCallOutcome> {
  return await t.mutation(internal.mcp.tools.call, {
    tokenHash: token.tokenHash,
    tool,
    input,
    sessionId: options.sessionId,
  });
}

/** Calls a tool and returns its result, failing the test if it errored. */
export async function callOk(
  t: McpTest,
  token: TestToken,
  tool: string,
  input: Record<string, unknown> = {},
  options: { sessionId?: string } = {},
  // Results are plain JSON; tests read fields by name.
): Promise<any> {
  const outcome = await callTool(t, token, tool, input, options);
  if (!outcome.ok) {
    throw new Error(`${tool} failed: ${outcome.error}`);
  }
  return outcome.result;
}

export async function callError(
  t: McpTest,
  token: TestToken,
  tool: string,
  input: Record<string, unknown> = {},
  options: { sessionId?: string } = {},
): Promise<string> {
  const outcome = await callTool(t, token, tool, input, options);
  if (outcome.ok) throw new Error(`${tool} unexpectedly succeeded`);
  return outcome.error;
}

export async function activityRows(t: McpTest) {
  return await t.run(async (ctx) =>
    ctx.db.query("mcpActivity").collect(),
  );
}

export async function scheduledJobs(t: McpTest, nameIncludes: string) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (job) => job.name.includes(nameIncludes),
    ),
  );
}

/** A JSON-RPC request through the real /mcp HTTP route. */
export async function mcpFetch(
  t: McpTest,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return await t.fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function bearer(token: TestToken) {
  return { Authorization: `Bearer ${token.token}` };
}
