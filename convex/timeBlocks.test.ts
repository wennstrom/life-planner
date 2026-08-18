import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { formatDateKey, startOfDayMs } from "./lib/dates";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "test@example.com", name: "Test User" }),
  );
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("timeBlocks.review", () => {
  it("writes the review and overwrites on re-review", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const start = Date.now() - 7200000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Write tests",
      start,
      end: start + 3600000,
      taskId,
    });

    await asUser.mutation(api.timeBlocks.review, {
      blockId,
      outcome: "done",
      actualMinutes: 55,
    });

    let block = await t.run(async (ctx) => ctx.db.get(blockId));
    expect(block?.review?.outcome).toBe("done");
    expect(block?.review?.actualMinutes).toBe(55);

    await asUser.mutation(api.timeBlocks.review, {
      blockId,
      outcome: "partial",
      actualMinutes: 40,
    });

    block = await t.run(async (ctx) => ctx.db.get(blockId));
    expect(block?.review?.outcome).toBe("partial");
    expect(block?.review?.actualMinutes).toBe(40);
  });

  it("marks task done when taskDone is true", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const start = Date.now() - 7200000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Finish",
      start,
      end: start + 3600000,
      taskId,
    });

    await asUser.mutation(api.timeBlocks.review, {
      blockId,
      outcome: "done",
      actualMinutes: 60,
      taskDone: true,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("done");
    expect(task?.completedAt).toEqual(expect.any(Number));
  });

  it("creates follow-up block when scheduleNext with nextStep", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const start = startOfDayMs(formatDateKey()) + 10 * 3600000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Part one",
      start,
      end: start + 3600000,
      taskId,
    });

    await asUser.mutation(api.timeBlocks.review, {
      blockId,
      outcome: "partial",
      actualMinutes: 45,
      nextStep: "Part two",
      scheduleNext: true,
    });

    const blocks = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlocks")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect(),
    );
    expect(blocks).toHaveLength(2);
    const followUp = blocks.find((b) => b._id !== blockId);
    expect(followUp?.title).toBe("Part two");
    expect(followUp!.end - followUp!.start).toBe(3600000);
  });

  it("ignores scheduleNext without nextStep or taskId", async () => {
    const { t, asUser } = await createAuthedTest();
    const start = Date.now() - 7200000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Personal",
      start,
      end: start + 3600000,
    });

    await asUser.mutation(api.timeBlocks.review, {
      blockId,
      outcome: "done",
      actualMinutes: 30,
      scheduleNext: true,
    });

    const blocks = await t.run(async (ctx) => ctx.db.query("timeBlocks").collect());
    expect(blocks).toHaveLength(1);
  });

  it("rejects another user's block", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
    );
    const blockId = await t.run(async (ctx) =>
      ctx.db.insert("timeBlocks", {
        userId: otherUserId,
        title: "Foreign",
        start: Date.now() - 3600000,
        end: Date.now() - 1000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asUser.mutation(api.timeBlocks.review, {
        blockId,
        outcome: "done",
        actualMinutes: 30,
      }),
    ).rejects.toThrow("Time block not found");
  });
});

describe("timeBlocks.listNeedingReview", () => {
  it("filters to ended, unreviewed, task-linked app blocks for the day", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const dateKey = formatDateKey();
    const dayStart = startOfDayMs(dateKey);
    const pastEnd = Date.now() - 60000;

    await t.run(async (ctx) => {
      await ctx.db.insert("timeBlocks", {
        userId,
        title: "Needs review",
        start: dayStart + 9 * 3600000,
        end: pastEnd,
        taskId,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlocks", {
        userId,
        title: "Meeting",
        start: dayStart + 11 * 3600000,
        end: pastEnd,
        taskId,
        origin: "google",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlocks", {
        userId,
        title: "Personal",
        start: dayStart + 13 * 3600000,
        end: pastEnd,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlocks", {
        userId,
        title: "Future",
        start: Date.now() + 3600000,
        end: Date.now() + 7200000,
        taskId,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlocks", {
        userId,
        title: "Done",
        start: dayStart + 7 * 3600000,
        end: pastEnd,
        taskId,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
        review: {
          outcome: "done",
          actualMinutes: 60,
          reviewedAt: Date.now(),
        },
      });
    });

    const needing = await asUser.query(api.timeBlocks.listNeedingReview, {
      dateKey,
    });
    expect(needing).toHaveLength(1);
    expect(needing[0].title).toBe("Needs review");
  });
});
