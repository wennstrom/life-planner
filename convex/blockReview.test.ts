import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { formatDateKey } from "./lib/dates";
import {
  UNREVIEWED_MAX_LIMIT,
  blockAwaitsReview,
  unreviewedWindow,
} from "./lib/blockReview";

const HOUR = 3600000;

function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("blockAwaitsReview", () => {
  it("needs a block review for app blocks without tasks", () => {
    expect(blockAwaitsReview({ origin: "app", memberships: [] })).toBe(true);
    expect(
      blockAwaitsReview({
        origin: "app",
        memberships: [],
        review: { outcome: "done" },
      }),
    ).toBe(false);
  });

  it("needs a review per task for app blocks with tasks", () => {
    expect(
      blockAwaitsReview({
        origin: "app",
        memberships: [{ review: { outcome: "done" } }, {}],
      }),
    ).toBe(true);
    expect(
      blockAwaitsReview({
        origin: "app",
        memberships: [{ review: { outcome: "done" } }],
        review: undefined,
      }),
    ).toBe(false);
  });

  it("never asks to review Google blocks", () => {
    expect(blockAwaitsReview({ origin: "google", memberships: [] })).toBe(
      false,
    );
  });
});

describe("timeBlocks.reviewTaskless", () => {
  it("stores a block-level review and drops the block from the queue", async () => {
    const { t, asUser } = createAuthedTest();
    const end = Date.now() - 60000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Lunch walk",
      start: end - HOUR,
      end,
    });

    const before = await asUser.query(api.timeBlocks.listNeedingReview, {
      dateKey: formatDateKey(),
    });
    expect(before.map((b) => b._id)).toContain(blockId);

    await asUser.mutation(api.timeBlocks.reviewTaskless, {
      blockId,
      outcome: "partial",
      actualMinutes: 30,
      focus: "shallow",
      note: "Cut short",
    });

    const block = await t.run(async (ctx) => ctx.db.get(blockId));
    expect(block?.review).toMatchObject({
      outcome: "partial",
      actualMinutes: 30,
      focus: "shallow",
      note: "Cut short",
    });
    expect(typeof block?.review?.reviewedAt).toBe("number");

    const after = await asUser.query(api.timeBlocks.listNeedingReview, {
      dateKey: formatDateKey(),
    });
    expect(after.map((b) => b._id)).not.toContain(blockId);
  });

  it("refuses blocks that have tasks", async () => {
    const { asUser } = createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const end = Date.now() - 60000;
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Work",
      start: end - HOUR,
      end,
      taskIds: [taskId],
    });

    await expect(
      asUser.mutation(api.timeBlocks.reviewTaskless, {
        blockId,
        outcome: "done",
        actualMinutes: 60,
      }),
    ).rejects.toThrow("Review each task");
  });

  it("refuses Google blocks and other users' blocks", async () => {
    const { t, asUser, userId } = createAuthedTest();
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
      asUser.mutation(api.timeBlocks.reviewTaskless, {
        blockId: googleId,
        outcome: "done",
        actualMinutes: 1,
      }),
    ).rejects.toThrow("Time block not found");

    const otherId = await t
      .withIdentity({ subject: "user_other" })
      .mutation(api.timeBlocks.create, { title: "Theirs", start: 1, end: 2 });
    await expect(
      asUser.mutation(api.timeBlocks.reviewTaskless, {
        blockId: otherId,
        outcome: "done",
        actualMinutes: 1,
      }),
    ).rejects.toThrow("Time block not found");
  });

  it("schedules the next step tomorrow without tasks when asked", async () => {
    const { t, asUser, userId } = createAuthedTest();
    const start = new Date(2026, 9, 31, 9, 0).getTime();
    const blockId = await asUser.mutation(api.timeBlocks.create, {
      title: "Admin",
      start,
      end: start + HOUR,
    });

    await asUser.mutation(api.timeBlocks.reviewTaskless, {
      blockId,
      outcome: "missed",
      actualMinutes: 0,
      nextStep: "Pay invoices",
      scheduleNext: true,
    });

    const blocks = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlocks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    const followUp = blocks.find((b) => b.title === "Pay invoices");
    expect(followUp).toBeDefined();
    expect(followUp!.start).toBe(new Date(2026, 10, 1, 9, 0).getTime());
    expect(followUp!.end - followUp!.start).toBe(HOUR);
    expect(followUp!.review).toBeUndefined();
  });
});

describe("unreviewedWindow", () => {
  const DAY = 24 * HOUR;

  it("looks back 14 days from the start of the selected day", () => {
    const beforeMs = new Date(2026, 9, 20).getTime();
    const window = unreviewedWindow({ beforeMs, nowMs: beforeMs + 10 * HOUR });
    expect(window.cutoffMs).toBe(beforeMs);
    expect(window.fromMs).toBe(beforeMs - 14 * DAY);
    expect(window.limit).toBe(50);
  });

  it("stops at now when a future day is selected", () => {
    const nowMs = new Date(2026, 9, 20, 15).getTime();
    const beforeMs = new Date(2026, 9, 22).getTime();
    expect(unreviewedWindow({ beforeMs, nowMs }).cutoffMs).toBe(nowMs);
  });

  it("clamps the limit", () => {
    expect(unreviewedWindow({ beforeMs: 0, nowMs: 0, limit: 0 }).limit).toBe(1);
    expect(
      unreviewedWindow({ beforeMs: 0, nowMs: 0, limit: 10_000 }).limit,
    ).toBe(UNREVIEWED_MAX_LIMIT);
  });
});

describe("timeBlocks.listUnreviewedBefore", () => {
  const dayStart = new Date(2026, 9, 20).getTime();
  const nowMs = dayStart + 10 * HOUR;
  const at = (daysBefore: number, hour: number) =>
    new Date(2026, 9, 20 - daysBefore, hour).getTime();

  it("returns earlier blocks that still need a review, oldest first", async () => {
    const { t, asUser } = createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });
    const block = (title: string, start: number, taskIds = [taskId]) =>
      asUser.mutation(api.timeBlocks.create, {
        title,
        start,
        end: start + HOUR,
        taskIds,
      });

    await block("Yesterday", at(1, 9));
    await block("Three days ago, no tasks", at(3, 14), []);
    await block("Today", at(0, 8));
    await block("Too old", at(15, 9));
    await block("Crosses midnight", at(1, 23) + 30 * 60000);
    const reviewedId = await block("Reviewed", at(2, 9));
    const membershipId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", reviewedId))
        .collect();
      return rows[0]._id;
    });
    await asUser.mutation(api.timeBlocks.review, {
      timeBlockTaskId: membershipId,
      outcome: "done",
      actualMinutes: 60,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("timeBlocks", {
        userId: "user_test1",
        title: "Google",
        start: at(1, 11),
        end: at(1, 12),
        origin: "google",
        syncState: "synced",
        updatedAt: 1,
      });
    });
    await t
      .withIdentity({ subject: "user_other" })
      .mutation(api.timeBlocks.create, {
        title: "Someone else",
        start: at(1, 9),
        end: at(1, 10),
      });

    const result = await asUser.query(api.timeBlocks.listUnreviewedBefore, {
      beforeMs: dayStart,
      nowMs,
    });
    expect(result.map((b) => b.title)).toEqual([
      "Three days ago, no tasks",
      "Yesterday",
    ]);
    expect(result[1].memberships).toHaveLength(1);
  });

  it("respects the limit", async () => {
    const { asUser } = createAuthedTest();
    for (let day = 1; day <= 4; day++) {
      await asUser.mutation(api.timeBlocks.create, {
        title: `Day ${day}`,
        start: at(day, 9),
        end: at(day, 10),
      });
    }
    const result = await asUser.query(api.timeBlocks.listUnreviewedBefore, {
      beforeMs: dayStart,
      nowMs,
      limit: 2,
    });
    expect(result.map((b) => b.title)).toEqual(["Day 4", "Day 3"]);
  });
});
