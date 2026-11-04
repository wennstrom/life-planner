import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

const HOUR = 3600000;

function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("timeBlocks.duplicate", () => {
  it("copies title, duration, and tasks without reviews, and syncs each copy", async () => {
    const { t, asUser } = createAuthedTest();
    const a = await asUser.mutation(api.tasks.create, { title: "A" });
    const b = await asUser.mutation(api.tasks.create, { title: "B" });
    const start = new Date(2026, 9, 26, 9, 0).getTime();
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Deep work",
      start,
      end: start + 90 * 60000,
      taskIds: [a, b],
    });
    const sourceRows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: sourceRows[0]._id,
      outcome: "done",
      actualMinutes: 45,
    });

    const scheduledBefore = await t.run(
      async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).length,
    );
    const starts = [
      new Date(2026, 9, 27, 9, 0).getTime(),
      new Date(2026, 9, 29, 9, 0).getTime(),
    ];
    const copies = await asUser.mutation(api.timeBlocks.duplicate, {
      blockId,
      starts,
    });
    expect(copies).toHaveLength(2);

    for (const [index, copyId] of copies.entries()) {
      const { block, rows } = await t.run(async (ctx) => ({
        block: await ctx.db.get(copyId),
        rows: await ctx.db
          .query("timeBlockTasks")
          .withIndex("by_block", (q) => q.eq("blockId", copyId))
          .collect(),
      }));
      expect(block).toMatchObject({
        title: "Deep work",
        start: starts[index],
        end: starts[index] + 90 * 60000,
        origin: "app",
        syncState: "pending",
      });
      expect(block?.review).toBeUndefined();
      expect(
        rows.sort((x, y) => x.order - y.order).map((row) => row.taskId),
      ).toEqual([a, b]);
      expect(rows.every((row) => row.review === undefined)).toBe(true);
    }

    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const syncs = scheduled
      .slice(scheduledBefore)
      .filter((job) => job.name.includes("syncBlock"));
    expect(syncs.map((job) => job.args[0])).toEqual(
      copies.map((copyId) => ({ blockId: copyId })),
    );
  });

  it("copies a block without tasks and drops repeated starts", async () => {
    const { t, asUser } = createAuthedTest();
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Run",
      start: HOUR,
      end: 2 * HOUR,
    });
    await asUser.mutation(api.timeBlocks.reviewTaskless, {
      blockId,
      outcome: "done",
      actualMinutes: 60,
    });

    const copies = await asUser.mutation(api.timeBlocks.duplicate, {
      blockId,
      starts: [5 * HOUR, 5 * HOUR],
    });
    expect(copies).toHaveLength(1);
    const copy = await t.run(async (ctx) => ctx.db.get(copies[0]));
    expect(copy?.review).toBeUndefined();
    expect(copy?.end).toBe(6 * HOUR);
  });

  it("validates ownership, origin, and the number of copies", async () => {
    const { t, asUser, userId } = createAuthedTest();
    const theirs = await t
      .withIdentity({ subject: "user_other" })
      .mutation(api.timeBlocks.create, { title: "Theirs", start: 1, end: 2 });
    await expect(
      asUser.mutation(api.timeBlocks.duplicate, {
        blockId: theirs,
        starts: [10],
      }),
    ).rejects.toThrow("Time block not found");

    const googleId = await t.run(async (ctx) =>
      ctx.db.insert("timeBlocks", {
        userId,
        title: "Meeting",
        start: 1,
        end: 2,
        origin: "google",
        syncState: "synced",
        updatedAt: 1,
      }),
    );
    await expect(
      asUser.mutation(api.timeBlocks.duplicate, {
        blockId: googleId,
        starts: [10],
      }),
    ).rejects.toThrow("Time block not found");

    const mine = await asUser.mutation(api.timeBlocks.create, {
      title: "Mine",
      start: 1,
      end: 2,
    });
    await expect(
      asUser.mutation(api.timeBlocks.duplicate, {
        blockId: mine,
        starts: Array.from({ length: 61 }, (_, i) => (i + 1) * HOUR),
      }),
    ).rejects.toThrow("At most 60 copies");
    await expect(
      asUser.mutation(api.timeBlocks.duplicate, {
        blockId: mine,
        starts: [Number.NaN],
      }),
    ).rejects.toThrow("Invalid start time");
  });
});
