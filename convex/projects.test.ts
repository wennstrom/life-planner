import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("projects.remove", () => {
  it("unlinks tasks when deleteTasks is false", async () => {
    const { t, asUser } = await createAuthedTest();

    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Draft proposal",
      projectId,
    });

    await asUser.mutation(api.projects.remove, {
      projectId,
      deleteTasks: false,
    });

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project).toBeNull();

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task).toBeTruthy();
    expect(task?.projectId).toBeUndefined();
  });

  it("deletes tasks and schedules Google cancel for their blocks when deleteTasks is true", async () => {
    vi.useFakeTimers();
    try {
      const { t, asUser, userId } = await createAuthedTest();

      const projectId = await asUser.mutation(api.projects.create, {
        name: "Website",
        color: "#6366f1",
      });
      const taskId = await asUser.mutation(api.tasks.create, {
        title: "Draft proposal",
        projectId,
      });
      const otherTaskId = await asUser.mutation(api.tasks.create, {
        title: "Unrelated",
      });

      const blockId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("timeBlocks", {
          userId,
          title: "Write intro",
          start: Date.now(),
          end: Date.now() + 3600000,
          origin: "app",
          googleEventId: "evt_1",
          syncState: "synced",
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
      const sharedBlockId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("timeBlocks", {
          userId,
          title: "Shared sitting",
          start: Date.now() + 1800000,
          end: Date.now() + 5400000,
          origin: "app",
          syncState: "synced",
          updatedAt: Date.now(),
        });
        await ctx.db.insert("timeBlockTasks", {
          userId,
          blockId: id,
          taskId,
          order: 0,
        });
        await ctx.db.insert("timeBlockTasks", {
          userId,
          blockId: id,
          taskId: otherTaskId,
          order: 1,
        });
        return id;
      });
      const otherBlockId = await t.run(async (ctx) =>
        ctx.db.insert("timeBlocks", {
          userId,
          title: "Personal",
          start: Date.now() + 3600000,
          end: Date.now() + 7200000,
          origin: "app",
          syncState: "synced",
          updatedAt: Date.now(),
        }),
      );

      await asUser.mutation(api.projects.remove, {
        projectId,
        deleteTasks: true,
      });

      expect(await t.run(async (ctx) => ctx.db.get(projectId))).toBeNull();
      expect(await t.run(async (ctx) => ctx.db.get(taskId))).toBeNull();
      expect(await t.run(async (ctx) => ctx.db.get(otherTaskId))).toBeTruthy();

      const pendingBlock = await t.run(async (ctx) => ctx.db.get(blockId));
      expect(pendingBlock).toBeTruthy();
      expect(pendingBlock?.syncState).toBe("pending");

      await t.finishAllScheduledFunctions(() => {
        vi.runAllTimers();
      });

      expect(await t.run(async (ctx) => ctx.db.get(blockId))).toBeNull();
      const shared = await t.run(async (ctx) => ctx.db.get(sharedBlockId));
      expect(shared).toBeTruthy();
      expect(shared?.syncState).toBe("synced");
      const remaining = await t.run(async (ctx) =>
        ctx.db
          .query("timeBlockTasks")
          .withIndex("by_block", (q) => q.eq("blockId", sharedBlockId))
          .collect(),
      );
      expect(remaining.map((row) => row.taskId)).toEqual([otherTaskId]);
      expect(await t.run(async (ctx) => ctx.db.get(otherBlockId))).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes an empty project", async () => {
    const { t, asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Empty",
      color: "#22c55e",
    });

    await asUser.mutation(api.projects.remove, {
      projectId,
      deleteTasks: true,
    });

    expect(await t.run(async (ctx) => ctx.db.get(projectId))).toBeNull();
  });

  it("rejects another user's project", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherUserId = "user_other";
    const foreignProjectId = await t.run(async (ctx) =>
      ctx.db.insert("projects", {
        userId: otherUserId,
        name: "Foreign",
        color: "#64748b",
        status: "active",
        order: 0,
      }),
    );

    await expect(
      asUser.mutation(api.projects.remove, {
        projectId: foreignProjectId,
        deleteTasks: false,
      }),
    ).rejects.toThrow("Project not found");
  });
});
