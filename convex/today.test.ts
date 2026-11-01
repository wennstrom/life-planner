import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { dayWindow, formatDateKey } from "../src/lib/dates";

function todayWindow() {
  return dayWindow(formatDateKey());
}

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("today day records", () => {
  it("returns null dayRecord when the day has no saved state", async () => {
    const { asUser } = await createAuthedTest();

    const today = await asUser.query(api.today.get, todayWindow());

    expect(today.dayRecord).toBeNull();
  });

  it("saves and returns the day's intention", async () => {
    const { asUser } = await createAuthedTest();

    await asUser.mutation(api.today.saveIntention, {
      intention: "Protect the morning for deep work.",
      dateKey: formatDateKey(),
    });

    const today = await asUser.query(api.today.get, todayWindow());
    expect(today.dayRecord?.intention).toBe(
      "Protect the morning for deep work.",
    );
    expect(today.dayRecord?.shutdownCompletedAt).toBeUndefined();
  });

  it("stores shutdown completion on the current day record", async () => {
    const { asUser } = await createAuthedTest();

    await asUser.mutation(api.today.saveIntention, {
      intention: "Finish the auth refactor.",
      dateKey: formatDateKey(),
    });
    await asUser.mutation(api.today.completeShutdown, {
      note: "Wrapped auth refactor, next is test cleanup.",
      dateKey: formatDateKey(),
    });

    const today = await asUser.query(api.today.get, todayWindow());
    expect(today.dayRecord?.intention).toBe("Finish the auth refactor.");
    expect(today.dayRecord?.shutdownNote).toBe(
      "Wrapped auth refactor, next is test cleanup.",
    );
    expect(today.dayRecord?.shutdownCompletedAt).toEqual(expect.any(Number));
  });
});

describe("today.get local day window", () => {
  it("uses the client's day for blocks and the day record", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    // 1 Nov 2026 in Stockholm (UTC+1), as the client sends it.
    const nov1 = {
      dateKey: "2026-11-01",
      dayStartMs: Date.UTC(2026, 9, 31, 23),
      dayEndMs: Date.UTC(2026, 10, 1, 23),
    };
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Early start",
    });
    await t.run(async (ctx) => {
      const blockId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "00:30 local",
        start: Date.UTC(2026, 9, 31, 23, 30),
        end: Date.UTC(2026, 10, 1, 0),
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId,
        taskId,
        order: 0,
      });
    });
    await asUser.mutation(api.today.saveIntention, {
      intention: "Start early.",
      dateKey: nov1.dateKey,
    });

    const today = await asUser.query(api.today.get, nov1);
    expect(today.dateKey).toBe("2026-11-01");
    expect(today.dayRecord?.intention).toBe("Start early.");
    expect(today.tasks.map((task) => task._id)).toEqual([taskId]);

    const oct31 = await asUser.query(api.today.get, {
      dateKey: "2026-10-31",
      dayStartMs: Date.UTC(2026, 9, 30, 23),
      dayEndMs: Date.UTC(2026, 9, 31, 23),
    });
    expect(oct31.dayRecord).toBeNull();
    expect(oct31.tasks).toHaveLength(0);
  });
});
