import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";
import { formatDateKey, startOfDayMs } from "./lib/dates";
import {
  setGoogleCalendarClientForTests,
  type GoogleCalendarClient,
} from "./google/client";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("projects and tasks", () => {
  it("creates backlog tasks and shows on today when block is planned", async () => {
    const { asUser } = await createAuthedTest();

    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Draft proposal",
      projectId,
    });

    const backlog = await asUser.query(api.backlog.get, {});
    expect(backlog.total).toBe(1);
    expect(backlog.groups[0].tasks[0]._id).toBe(taskId);

    const start = startOfDayMs(formatDateKey()) + 10 * 3600000;
    await asUser.mutation(api.timeBlocks.create, {
      title: "First hour on proposal",
      start,
      end: start + 3600000,
      taskIds: [taskId],
    });

    const today = await asUser.query(api.today.get, {});
    expect(today.tasks.some((task) => task._id === taskId)).toBe(true);

    const backlogAfterSchedule = await asUser.query(api.backlog.get, {});
    expect(backlogAfterSchedule.total).toBe(1);
    expect(backlogAfterSchedule.groups[0].tasks[0]._id).toBe(taskId);
    expect(backlogAfterSchedule.groups[0].tasks[0].active).toBe(true);
  });
});

describe("google sync", () => {
  it("syncs an outbound block with a Clerk access token", async () => {
    const mockClient: GoogleCalendarClient = {
      insertEvent: async () => ({ id: "evt_1", start: {}, end: {} }),
      updateEvent: async () => ({ id: "evt_1", start: {}, end: {} }),
      deleteEvent: async () => {},
      listChanges: async () => ({ events: [], nextSyncToken: "sync_1" }),
      watch: async () => ({
        resourceId: "res_1",
        expiration: Date.now() + 1000,
      }),
    };

    setGoogleCalendarClientForTests(mockClient);

    const { t, userId } = await createAuthedTest();

    await t.run(async (ctx) =>
      ctx.db.insert("googleAccounts", {
        userId,
        calendarSyncToken: "sync-token",
      }),
    );

    const blockId = await t.run(async (ctx) =>
      ctx.db.insert("timeBlocks", {
        userId,
        title: "Focus",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "pending",
        updatedAt: Date.now(),
      }),
    );

    await t.action(internal.google.outbound.syncBlock, { blockId });

    const block = await t.run(async (ctx) => ctx.db.get(blockId));
    expect(block?.googleEventId).toBe("evt_1");
    expect(block?.syncState).toBe("synced");

    setGoogleCalendarClientForTests(null);
  });

  it("outbound uses block title only for Google summary", async () => {
    let capturedSummary = "";
    const mockClient: GoogleCalendarClient = {
      insertEvent: async (event) => {
        capturedSummary = event.summary;
        return { id: "evt_compose", start: {}, end: {} };
      },
      updateEvent: async () => ({ id: "evt_compose", start: {}, end: {} }),
      deleteEvent: async () => {},
      listChanges: async () => ({ events: [], nextSyncToken: "sync_1" }),
      watch: async () => ({
        resourceId: "res_1",
        expiration: Date.now() + 1000,
      }),
    };

    setGoogleCalendarClientForTests(mockClient);

    const { t, userId } = await createAuthedTest();

    await t.run(async (ctx) =>
      ctx.db.insert("googleAccounts", {
        userId,
        calendarSyncToken: "sync-token",
      }),
    );

    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Task title",
        status: "backlog",
        order: 0,
      }),
    );

    const blockId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Block intent",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "pending",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: id,
        taskId,
        order: 0,
      });
      return id;
    });

    await t.action(internal.google.outbound.syncBlock, { blockId });

    expect(capturedSummary).toBe("Block intent");

    setGoogleCalendarClientForTests(null);
  });

  it("merges inbound google events and resolves deletion", async () => {
    const { t, userId } = await createAuthedTest();

    await t.mutation(internal.google.inboundMutations.applyEvent, {
      userId,
      event: {
        id: "g_evt_1",
        summary: "Standup",
        start: { dateTime: new Date().toISOString() },
        end: { dateTime: new Date(Date.now() + 1800000).toISOString() },
        updated: new Date().toISOString(),
      },
    });

    const blocks = await t.run(async (ctx) =>
      ctx.db.query("timeBlocks").collect(),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].origin).toBe("google");

    await t.run(async (ctx) => {
      const taskId = await ctx.db.insert("tasks", {
        userId,
        title: "Standup notes",
        status: "backlog",
        order: 0,
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: blocks[0]._id,
        taskId,
        order: 0,
      });
    });

    await t.mutation(internal.google.inboundMutations.applyEvent, {
      userId,
      event: { id: "g_evt_1", status: "cancelled" },
    });

    const afterDelete = await t.run(async (ctx) =>
      ctx.db.query("timeBlocks").collect(),
    );
    expect(afterDelete).toHaveLength(0);

    const leftoverMemberships = await t.run(async (ctx) =>
      ctx.db.query("timeBlockTasks").collect(),
    );
    expect(leftoverMemberships).toHaveLength(0);
  });

  it("inbound leaves app-origin title unchanged", async () => {
    const { t, userId } = await createAuthedTest();
    const now = Date.now();

    await t.run(async (ctx) =>
      ctx.db.insert("timeBlocks", {
        userId,
        title: "Intent only",
        start: now,
        end: now + 3600000,
        googleEventId: "g_evt_app",
        origin: "app",
        syncState: "synced",
        updatedAt: now,
        lastSyncedAt: now,
      }),
    );

    const newStart = now + 1800000;
    await t.mutation(internal.google.inboundMutations.applyEvent, {
      userId,
      event: {
        id: "g_evt_app",
        summary: "Task — Intent only",
        start: { dateTime: new Date(newStart).toISOString() },
        end: { dateTime: new Date(newStart + 3600000).toISOString() },
        updated: new Date(now + 5000).toISOString(),
      },
    });

    const block = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlocks")
        .withIndex("by_googleEventId", (q) => q.eq("googleEventId", "g_evt_app"))
        .unique(),
    );

    expect(block?.title).toBe("Intent only");
    expect(block?.start).toBe(newStart);
  });

  it("prefers app block when app updatedAt is newer on conflict", async () => {
    const { t, userId } = await createAuthedTest();
    const now = Date.now();

    await t.run(async (ctx) =>
      ctx.db.insert("timeBlocks", {
        userId,
        title: "Local title",
        start: now,
        end: now + 3600000,
        googleEventId: "g_evt_conflict",
        origin: "app",
        syncState: "synced",
        updatedAt: now + 10000,
        lastSyncedAt: now,
      }),
    );

    await t.mutation(internal.google.inboundMutations.applyEvent, {
      userId,
      event: {
        id: "g_evt_conflict",
        summary: "Remote title",
        start: { dateTime: new Date(now).toISOString() },
        end: { dateTime: new Date(now + 3600000).toISOString() },
        updated: new Date(now).toISOString(),
      },
    });

    const block = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlocks")
        .withIndex("by_googleEventId", (q) =>
          q.eq("googleEventId", "g_evt_conflict"),
        )
        .unique(),
    );

    expect(block?.title).toBe("Local title");
  });
});
