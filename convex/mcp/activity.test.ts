import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { DAY_MS } from "../lib/dates";
import { PURGE_BATCH_SIZE } from "./activity";
import { activityRows, insertToken, scheduledJobs, setupMcp } from "./test.helpers";
import type { McpTest, TestToken } from "./test.helpers";

async function insertRows(t: McpTest, token: TestToken, ats: Array<number>) {
  await t.run(async (ctx) => {
    for (const at of ats) {
      await ctx.db.insert("mcpActivity", {
        userId: token.userId,
        tokenId: token.tokenId,
        tool: "list_tasks",
        ok: true,
        summary: "Listed 0 tasks",
        targetIds: [],
        at,
      });
    }
  });
}

describe("mcp.activity.purgeOld", () => {
  it("deletes only rows older than 30 days", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const now = Date.now();
    await insertRows(t, token, [now - 31 * DAY_MS, now - 29 * DAY_MS, now]);

    const result = await t.mutation(internal.mcp.activity.purgeOld, {});
    expect(result.deleted).toBe(1);
    const left = await activityRows(t);
    expect(left).toHaveLength(2);
    expect(await scheduledJobs(t, "purgeOld")).toHaveLength(0);
  });

  it("schedules another batch when a batch is full", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const old = Date.now() - 40 * DAY_MS;
    await insertRows(
      t,
      token,
      Array.from({ length: PURGE_BATCH_SIZE + 5 }, (_, i) => old + i),
    );

    const result = await t.mutation(internal.mcp.activity.purgeOld, {});
    expect(result.deleted).toBe(PURGE_BATCH_SIZE);
    expect(await scheduledJobs(t, "purgeOld")).toHaveLength(1);
  });
});
