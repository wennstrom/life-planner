import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";
import {
  setGoogleCalendarClientForTests,
  type GoogleCalendarClient,
} from "./google/client";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "test@example.com", name: "Test User" }),
  );
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("projects, tasks, notes", () => {
  it("creates backlog tasks and sends to today", async () => {
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

    await asUser.mutation(api.tasks.sendToToday, { taskId });
    const today = await asUser.query(api.today.get, {});
    expect(today.tasks.some((task) => task._id === taskId)).toBe(true);
  });

  it("creates and updates notes", async () => {
    const { asUser } = await createAuthedTest();
    const noteId = await asUser.mutation(api.notes.create, {
      title: "Meeting",
      body: "Notes body",
    });

    await asUser.mutation(api.notes.update, {
      noteId,
      body: "Updated body",
    });

    const note = await asUser.query(api.notes.get, { noteId });
    expect(note.body).toBe("Updated body");
  });
});

describe("google sync", () => {
  it("refreshes token and syncs outbound block", async () => {
    const mockClient: GoogleCalendarClient = {
      insertEvent: async () => ({ id: "evt_1", start: {}, end: {} }),
      updateEvent: async () => ({ id: "evt_1", start: {}, end: {} }),
      deleteEvent: async () => {},
      listChanges: async () => ({ events: [], nextSyncToken: "sync_1" }),
      watch: async () => ({ resourceId: "res_1", expiration: Date.now() + 1000 }),
      refreshAccessToken: async () => ({
        accessToken: "new_access",
        refreshToken: "new_refresh",
        expiryMs: Date.now() + 3600000,
      }),
    };

    setGoogleCalendarClientForTests(mockClient);

    const { t, userId } = await createAuthedTest();

    await t.run(async (ctx) =>
      ctx.db.insert("googleAccounts", {
        userId,
        accessToken: "old_access",
        refreshToken: "refresh",
        tokenExpiry: Date.now() - 1000,
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

    const blocks = await t.run(async (ctx) => ctx.db.query("timeBlocks").collect());
    expect(blocks).toHaveLength(1);
    expect(blocks[0].origin).toBe("google");

    await t.mutation(internal.google.inboundMutations.applyEvent, {
      userId,
      event: { id: "g_evt_1", status: "cancelled" },
    });

    const afterDelete = await t.run(async (ctx) =>
      ctx.db.query("timeBlocks").collect(),
    );
    expect(afterDelete).toHaveLength(0);
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
        .withIndex("by_googleEventId", (q) => q.eq("googleEventId", "g_evt_conflict"))
        .unique(),
    );

    expect(block?.title).toBe("Local title");
  });
});
