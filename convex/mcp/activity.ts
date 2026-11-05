import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { DAY_MS } from "../lib/dates";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const ACTIVITY_RETENTION_MS = 30 * DAY_MS;
export const PURGE_BATCH_SIZE = 500;
const SUMMARY_MAX_LENGTH = 300;
const MAX_TARGET_IDS = 20;

export async function logActivity(
  ctx: MutationCtx,
  entry: {
    userId: string;
    tokenId: Id<"apiTokens">;
    tool: string;
    ok: boolean;
    summary: string;
    targetIds: Array<string>;
    /** The token's name. */
    agent: string;
    sessionId: string | undefined;
  },
) {
  const summary =
    entry.summary.length > SUMMARY_MAX_LENGTH
      ? `${entry.summary.slice(0, SUMMARY_MAX_LENGTH - 1)}…`
      : entry.summary;
  await ctx.db.insert("mcpActivity", {
    ...entry,
    summary,
    targetIds: [...new Set(entry.targetIds)].slice(0, MAX_TARGET_IDS),
    at: Date.now(),
  });
}

/** Deletes activity older than 30 days, a batch at a time. Run by a cron. */
export const purgeOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ACTIVITY_RETENTION_MS;
    const rows = await ctx.db
      .query("mcpActivity")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(PURGE_BATCH_SIZE);
    for (const row of rows) {
      await ctx.db.delete("mcpActivity", row._id);
    }
    if (rows.length === PURGE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.mcp.activity.purgeOld, {});
    }
    return { deleted: rows.length };
  },
});
