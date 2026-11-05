import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const ACTIVITY_LIST_LIMIT = 50;

/** A token's most recent MCP tool calls, newest first, for its owner. */
export const listForToken = query({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const token = await ctx.db.get("apiTokens", args.tokenId);
    if (!token || token.userId !== userId) {
      throw new Error("Token not found");
    }
    const rows = await ctx.db
      .query("mcpActivity")
      .withIndex("by_tokenId_and_at", (q) => q.eq("tokenId", args.tokenId))
      .order("desc")
      .take(ACTIVITY_LIST_LIMIT);
    return rows.map((row) => ({
      _id: row._id,
      tool: row.tool,
      ok: row.ok,
      summary: row.summary,
      at: row.at,
      agent: row.agent ?? null,
      sessionId: row.sessionId ?? null,
    }));
  },
});
