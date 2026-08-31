import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  buildTaskStatsMap,
  emptyTaskStats,
  isTaskActive,
} from "./taskStats";

async function createUserWithTask() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const taskId = await t.run(async (ctx) =>
    ctx.db.insert("tasks", {
      userId,
      title: "Task",
      status: "backlog",
      order: 0,
    }),
  );
  return { t, userId, taskId };
}

describe("buildTaskStatsMap", () => {
  it("counts all blocks but only reviewed minutes toward spent", async () => {
    const { t, userId, taskId } = await createUserWithTask();
    const now = Date.now();

    await t.run(async (ctx) => {
      const reviewedId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Reviewed",
        start: now,
        end: now + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: now,
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: reviewedId,
        taskId,
        order: 0,
        review: {
          outcome: "done",
          actualMinutes: 30,
          reviewedAt: now,
        },
      });
      const unreviewedId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Unreviewed",
        start: now + 7200000,
        end: now + 10800000,
        origin: "app",
        syncState: "synced",
        updatedAt: now,
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: unreviewedId,
        taskId,
        order: 0,
      });
    });

    const stats = await t.run(async (ctx) => {
      const map = await buildTaskStatsMap(ctx, userId);
      return map.get(taskId);
    });
    expect(stats?.blockCount).toBe(2);
    expect(stats?.spentMinutes).toBe(30);
  });

  it("derives active from blockCount when not done", async () => {
    const { t, userId, taskId } = await createUserWithTask();
    const now = Date.now();

    await t.run(async (ctx) => {
      const blockId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Block",
        start: now,
        end: now + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: now,
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId,
        taskId,
        order: 0,
      });
    });

    const stats = await t.run(async (ctx) => {
      const map = await buildTaskStatsMap(ctx, userId);
      return map.get(taskId);
    });
    expect(isTaskActive("backlog", stats)).toBe(true);
    expect(isTaskActive("done", stats)).toBe(false);
    expect(isTaskActive("backlog", emptyTaskStats())).toBe(false);
  });

  it("tracks latest nextStep and blocked reason from most recent review", async () => {
    const { t, userId, taskId } = await createUserWithTask();
    const now = Date.now();

    await t.run(async (ctx) => {
      const olderId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Older",
        start: now,
        end: now + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: now,
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: olderId,
        taskId,
        order: 0,
        review: {
          outcome: "partial",
          actualMinutes: 20,
          nextStep: "Old step",
          reviewedAt: now - 10000,
        },
      });
      const newerId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Newer",
        start: now + 7200000,
        end: now + 10800000,
        origin: "app",
        syncState: "synced",
        updatedAt: now,
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: newerId,
        taskId,
        order: 0,
        review: {
          outcome: "missed",
          actualMinutes: 10,
          nextStep: "Fresh step",
          blockedReason: "Waiting on review",
          reviewedAt: now,
        },
      });
    });

    const stats = await t.run(async (ctx) => {
      const map = await buildTaskStatsMap(ctx, userId);
      return map.get(taskId);
    });
    expect(stats?.latestNextStep).toBe("Fresh step");
    expect(stats?.latestBlockedReason).toBe("Waiting on review");
  });
});
