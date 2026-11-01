import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { formatDateKey } from "./lib/dates";
import { blockAwaitsReview } from "./lib/blockReview";

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
