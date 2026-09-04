import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { modules } from "./test.setup";
import { formatDateKey, startOfDayMs } from "./lib/dates";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

async function membershipIdForBlock(
  t: Awaited<ReturnType<typeof createAuthedTest>>["t"],
  blockId: Id<"timeBlocks">,
) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("timeBlockTasks")
      .withIndex("by_block", (q) => q.eq("blockId", blockId))
      .collect();
    return rows[0]._id;
  });
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
      taskIds: [taskId],
    });
    const membershipId = await membershipIdForBlock(t, blockId);

    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: membershipId,
      outcome: "done",
      actualMinutes: 55,
    });
    const row = await t.run(async (ctx) => ctx.db.get(membershipId));
    expect(row?.review?.outcome).toBe("done");
    expect(row?.review?.actualMinutes).toBe(55);

    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: membershipId,
      outcome: "partial",
      actualMinutes: 40,
    });
    const again = await t.run(async (ctx) => ctx.db.get(membershipId));
    expect(again?.review?.outcome).toBe("partial");
    expect(again?.review?.actualMinutes).toBe(40);
  });

  it("marks that membership's task done when taskDone is true", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const other = await asUser.mutation(api.tasks.create, { title: "Other" });
    const start = Date.now() - 7200000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Finish",
      start,
      end: start + 3600000,
      taskIds: [taskId, other],
    });
    const membershipId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect();
      return rows.find((r) => r.taskId === taskId)!._id;
    });

    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: membershipId,
      outcome: "done",
      actualMinutes: 60,
      taskDone: true,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    const leftover = await t.run(async (ctx) => ctx.db.get(other));
    expect(task?.columnId).toBeDefined();
    expect(task?.completedAt).toEqual(expect.any(Number));
    expect(leftover?.columnId).toBeUndefined();
    expect(leftover?.completedAt).toBeUndefined();
  });

  it("creates follow-up block when scheduleNext with nextStep", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const start = startOfDayMs(formatDateKey()) + 10 * 3600000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Part one",
      start,
      end: start + 3600000,
      taskIds: [taskId],
    });
    const membershipId = await membershipIdForBlock(t, blockId);

    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: membershipId,
      outcome: "partial",
      actualMinutes: 45,
      nextStep: "Part two",
      scheduleNext: true,
    });

    const followUpRows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect(),
    );
    expect(followUpRows).toHaveLength(2);
    const followUpMembership = followUpRows.find((r) => r.blockId !== blockId);
    expect(followUpMembership).toBeDefined();
    const followUp = await t.run(async (ctx) =>
      ctx.db.get(followUpMembership!.blockId),
    );
    expect(followUp?.title).toBe("Part two");
    expect(followUp!.end - followUp!.start).toBe(3600000);
    const siblings = followUpRows.filter(
      (r) => r.blockId === followUpMembership!.blockId,
    );
    expect(siblings).toHaveLength(1);
    expect(siblings[0].taskId).toBe(taskId);
  });

  it("ignores scheduleNext when nextStep is empty", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const start = Date.now() - 7200000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Sitting",
      start,
      end: start + 3600000,
      taskIds: [taskId],
    });
    const membershipId = await membershipIdForBlock(t, blockId);

    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: membershipId,
      outcome: "done",
      actualMinutes: 30,
      nextStep: "   ",
      scheduleNext: true,
    });

    const blocks = await t.run(async (ctx) => ctx.db.query("timeBlocks").collect());
    expect(blocks).toHaveLength(1);
  });

  it("rejects another user's membership", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherUserId = "user_other";
    const membershipId = await t.run(async (ctx) => {
      const taskId = await ctx.db.insert("tasks", {
        userId: otherUserId,
        title: "Foreign task",
        order: 0,
      });
      const blockId = await ctx.db.insert("timeBlocks", {
        userId: otherUserId,
        title: "Foreign",
        start: Date.now() - 3600000,
        end: Date.now() - 1000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      return ctx.db.insert("timeBlockTasks", {
        userId: otherUserId,
        blockId,
        taskId,
        order: 0,
      });
    });

    await expect(
      asUser.mutation(api.timeBlocks.review, {
        timeBlockTaskId: membershipId,
        outcome: "done",
        actualMinutes: 30,
      }),
    ).rejects.toThrow("Time block not found");
  });
});

describe("timeBlocks.listNeedingReview", () => {
  it("returns TimeBlockViews that still have an unreviewed membership", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const dateKey = formatDateKey();
    const pastEnd = Date.now() - 60000;
    const pastStart = pastEnd - 3600000;
    const a = await asUser.mutation(api.tasks.create, { title: "A" });
    const b = await asUser.mutation(api.tasks.create, { title: "B" });
    const googleTask = await asUser.mutation(api.tasks.create, {
      title: "Google task",
    });
    const futureTask = await asUser.mutation(api.tasks.create, {
      title: "Future task",
    });

    const pairId = await asUser.mutation(api.timeBlocks.create, {
      title: "Pair",
      start: pastStart,
      end: pastEnd,
      taskIds: [a, b],
    });
    await asUser.mutation(api.timeBlocks.create, {
      title: "Personal",
      start: pastStart,
      end: pastEnd,
    });
    await asUser.mutation(api.timeBlocks.create, {
      title: "Future",
      start: Date.now() + 3600000,
      end: Date.now() + 7200000,
      taskIds: [futureTask],
    });

    await t.run(async (ctx) => {
      const googleId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Meeting",
        start: pastStart,
        end: pastEnd,
        origin: "google",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: googleId,
        taskId: googleTask,
        order: 0,
      });
    });

    const needing = await asUser.query(api.timeBlocks.listNeedingReview, {
      dateKey,
    });
    expect(needing).toHaveLength(1);
    expect(needing[0].title).toBe("Pair");
    expect(needing[0].memberships.map((m) => m.taskTitle)).toEqual(["A", "B"]);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", pairId))
        .collect(),
    );
    const first = rows.find((r) => r.taskId === a)!;
    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: first._id,
      outcome: "done",
      actualMinutes: 20,
    });
    const still = await asUser.query(api.timeBlocks.listNeedingReview, {
      dateKey,
    });
    expect(still).toHaveLength(1);

    const second = rows.find((r) => r.taskId === b)!;
    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: second._id,
      outcome: "done",
      actualMinutes: 20,
    });
    const done = await asUser.query(api.timeBlocks.listNeedingReview, {
      dateKey,
    });
    expect(done).toHaveLength(0);
  });
});

describe("timeBlocks list views", () => {
  it("listForDay and listForRange attach memberships", async () => {
    const { asUser } = await createAuthedTest();
    const dateKey = formatDateKey();
    const start = startOfDayMs(dateKey) + 9 * 3600000;
    const taskId = await asUser.mutation(api.tasks.create, { title: "Draft" });
    await asUser.mutation(api.timeBlocks.create, {
      title: "Sitting",
      start,
      end: start + 3600000,
      taskIds: [taskId],
    });

    const day = await asUser.query(api.timeBlocks.listForDay, { dateKey });
    expect(day[0].memberships).toEqual([
      expect.objectContaining({ taskId, taskTitle: "Draft", order: 0 }),
    ]);

    const range = await asUser.query(api.timeBlocks.listForRange, {
      startMs: start,
      endMs: start + 3600000,
    });
    expect(range[0].memberships).toHaveLength(1);
  });

  it("listForTask returns sittings that include the task with full memberships", async () => {
    const { asUser } = await createAuthedTest();
    const a = await asUser.mutation(api.tasks.create, { title: "A" });
    const b = await asUser.mutation(api.tasks.create, { title: "B" });
    const start = Date.now();
    await asUser.mutation(api.timeBlocks.create, {
      title: "Pair",
      start,
      end: start + 3600000,
      taskIds: [a, b],
    });
    await asUser.mutation(api.timeBlocks.create, {
      title: "Solo",
      start: start + 7200000,
      end: start + 10800000,
      taskIds: [a],
    });

    const sittings = await asUser.query(api.timeBlocks.listForTask, {
      taskId: a,
    });
    expect(sittings.map((s) => s.title)).toEqual(["Solo", "Pair"]);
    expect(sittings[1].memberships.map((m) => m.taskTitle)).toEqual(["A", "B"]);
  });
});

describe("timeBlocks.remove", () => {
  it("schedules Google cancel then deletes the owner's block", async () => {
    vi.useFakeTimers();
    try {
      const { t, asUser, userId } = await createAuthedTest();
      const blockId = await t.run(async (ctx) =>
        ctx.db.insert("timeBlocks", {
          userId,
          title: "Focus",
          start: Date.now(),
          end: Date.now() + 3600000,
          origin: "google",
          googleEventId: "evt_g",
          syncState: "synced",
          updatedAt: Date.now(),
        }),
      );

      await asUser.mutation(api.timeBlocks.remove, { blockId });

      const pending = await t.run(async (ctx) => ctx.db.get(blockId));
      expect(pending?.syncState).toBe("pending");

      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });

      expect(await t.run(async (ctx) => ctx.db.get(blockId))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects another user's block", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherUserId = "user_other";
    const blockId = await t.run(async (ctx) =>
      ctx.db.insert("timeBlocks", {
        userId: otherUserId,
        title: "Foreign",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asUser.mutation(api.timeBlocks.remove, { blockId }),
    ).rejects.toThrow("Time block not found");
  });
});

describe("timeBlocks.create memberships", () => {
  it("stores multiple tasks in order", async () => {
    const { t, asUser } = await createAuthedTest();
    const a = await asUser.mutation(api.tasks.create, { title: "A" });
    const b = await asUser.mutation(api.tasks.create, { title: "B" });
    const start = Date.now();
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Pair",
      start,
      end: start + 3600000,
      taskIds: [a, b],
    });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    expect(rows.sort((x, y) => x.order - y.order).map((r) => r.taskId)).toEqual([
      a,
      b,
    ]);
  });
});

describe("timeBlocks.createFromTask memberships", () => {
  it("creates a membership for that task", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Draft" });
    const start = Date.now();
    const blockId = await asUser.mutation(api.timeBlocks.createFromTask, {
      taskId,
      start,
      end: start + 3600000,
    });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].taskId).toBe(taskId);
    expect(rows[0].order).toBe(0);
    const block = await t.run(async (ctx) => ctx.db.get(blockId));
    expect(block?.title).toBe("Draft");
  });

  it("rejects planning an archived task", async () => {
    const { asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Old" });
    await asUser.mutation(api.tasks.update, { taskId, archived: true });
    const start = Date.now();
    await expect(
      asUser.mutation(api.timeBlocks.createFromTask, {
        taskId,
        start,
        end: start + 3600000,
      }),
    ).rejects.toThrow("Cannot plan an archived task");
  });
});

describe("timeBlocks.update memberships", () => {
  it("replaces memberships, including empty for personal sitting", async () => {
    const { t, asUser } = await createAuthedTest();
    const a = await asUser.mutation(api.tasks.create, { title: "A" });
    const b = await asUser.mutation(api.tasks.create, { title: "B" });
    const start = Date.now();
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Pair",
      start,
      end: start + 3600000,
      taskIds: [a],
    });

    await asUser.mutation(api.timeBlocks.update, {
      blockId,
      taskIds: [b, a],
    });
    let rows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    expect(rows.sort((x, y) => x.order - y.order).map((r) => r.taskId)).toEqual([
      b,
      a,
    ]);

    await asUser.mutation(api.timeBlocks.update, {
      blockId,
      taskIds: [],
    });
    rows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("timeBlocks.remove memberships", () => {
  it("deletes memberships when the scheduled delete runs", async () => {
    vi.useFakeTimers();
    try {
      const { t, asUser } = await createAuthedTest();
      const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
      const start = Date.now();
      const blockId = await asUser.mutation(api.timeBlocks.create, {
        title: "Focus",
        start,
        end: start + 3600000,
        taskIds: [taskId],
      });

      await asUser.mutation(api.timeBlocks.remove, { blockId });
      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });

      const rows = await t.run(async (ctx) =>
        ctx.db
          .query("timeBlockTasks")
          .withIndex("by_block", (q) => q.eq("blockId", blockId))
          .collect(),
      );
      expect(rows).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("timeBlocks.review multi-task sitting", () => {
  it("does not give each task the full sitting duration when reviewed separately", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const taskA = await asUser.mutation(api.tasks.create, { title: "Task A" });
    const taskB = await asUser.mutation(api.tasks.create, { title: "Task B" });
    const taskC = await asUser.mutation(api.tasks.create, { title: "Task C" });
    
    const start = Date.now() - 7200000;
    const durationMs = 60 * 60 * 1000; // 60 minutes
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Multi-task sitting",
      start,
      end: start + durationMs,
      taskIds: [taskA, taskB, taskC],
    });

    const memberships = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect();
      return rows.sort((a, b) => a.order - b.order);
    });

    expect(memberships).toHaveLength(3);

    // Review first task with 20 minutes
    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: memberships[0]._id,
      outcome: "done",
      actualMinutes: 20,
    });

    // Review second task with 25 minutes
    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: memberships[1]._id,
      outcome: "done",
      actualMinutes: 25,
    });

    // Review third task with remaining 15 minutes
    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: memberships[2]._id,
      outcome: "done",
      actualMinutes: 15,
    });

    // Verify task stats don't overcount
    const { buildTaskStatsMap } = await import("./lib/taskStats");
    const stats = await t.run(async (ctx) => {
      const statsMap = await buildTaskStatsMap(ctx, userId);
      return {
        a: statsMap.get(taskA),
        b: statsMap.get(taskB),
        c: statsMap.get(taskC),
      };
    });

    expect(stats.a?.spentMinutes).toBe(20);
    expect(stats.b?.spentMinutes).toBe(25);
    expect(stats.c?.spentMinutes).toBe(15);

    // Total should equal the sitting duration, not 3x duration
    const total = (stats.a?.spentMinutes ?? 0) + (stats.b?.spentMinutes ?? 0) + (stats.c?.spentMinutes ?? 0);
    expect(total).toBe(60);
  });
});
