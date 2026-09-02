import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { modules } from "../test.setup";
import {
  replaceMemberships,
  requireOwnedTasks,
} from "./timeBlockMemberships";

describe("replaceMemberships", () => {
  it("inserts ordered unique rows and preserves review when a task stays", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const asUser = t.withIdentity({ subject: userId });
    const taskA = await asUser.mutation(api.tasks.create, { title: "A" });
    const taskB = await asUser.mutation(api.tasks.create, { title: "B" });
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Sitting",
      start: Date.now(),
      end: Date.now() + 3600000,
    });

    await t.run(async (ctx) => {
      await replaceMemberships(ctx, {
        userId,
        blockId,
        taskIds: [taskA, taskB],
      });
    });

    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect();
      expect(rows.map((r) => r.taskId)).toEqual([taskA, taskB]);
      await ctx.db.patch(rows[0]._id, {
        review: {
          outcome: "done",
          actualMinutes: 10,
          reviewedAt: Date.now(),
        },
      });
      await replaceMemberships(ctx, {
        userId,
        blockId,
        taskIds: [taskB, taskA],
      });
    });

    const again = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    const byTask = new Map(again.map((r) => [r.taskId, r]));
    expect(byTask.get(taskA)?.review?.actualMinutes).toBe(10);
    expect(byTask.get(taskA)?.order).toBe(1);
    expect(byTask.get(taskB)?.order).toBe(0);
  });

  it("rejects duplicate task ids and foreign tasks", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const asUser = t.withIdentity({ subject: userId });
    const taskA = await asUser.mutation(api.tasks.create, { title: "A" });
    const foreign = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: "other",
        title: "X",
        order: 0,
      }),
    );
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Sitting",
      start: Date.now(),
      end: Date.now() + 3600000,
    });

    await expect(
      t.run(async (ctx) =>
        replaceMemberships(ctx, {
          userId,
          blockId,
          taskIds: [taskA, taskA],
        }),
      ),
    ).rejects.toThrow("Duplicate task");

    await expect(
      t.run(async (ctx) => requireOwnedTasks(ctx, userId, [foreign])),
    ).rejects.toThrow("Task not found");
  });
});
