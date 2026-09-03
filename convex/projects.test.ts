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
        health: "onTrack",
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

describe("projects.create", () => {
  it("stores description when provided", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      description: "Launch the site",
      color: "#6366f1",
    });
    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.description).toBe("Launch the site");
  });

  it("omits description when blank", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      description: "   ",
      color: "#6366f1",
    });
    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.description).toBeUndefined();
  });

  it("rejects a color outside the palette", async () => {
    const { asUser } = await createAuthedTest();
    await expect(
      asUser.mutation(api.projects.create, {
        name: "Website",
        color: "#ffffff",
      }),
    ).rejects.toThrow("Invalid project color");
  });

  it("defaults health to onTrack when omitted", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.health).toBe("onTrack");
    expect(data.project.goalDate).toBeUndefined();
  });

  it("stores explicit health and goalDate", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
      health: "atRisk",
      goalDate: "2026-09-30",
    });
    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.health).toBe("atRisk");
    expect(data.project.goalDate).toBe("2026-09-30");
  });

  it("rejects an invalid goalDate on create", async () => {
    const { asUser } = await createAuthedTest();
    await expect(
      asUser.mutation(api.projects.create, {
        name: "Website",
        color: "#6366f1",
        goalDate: "2026-02-30",
      }),
    ).rejects.toThrow("Invalid goal date");
  });
});

describe("projects.update", () => {
  it("sets description", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await asUser.mutation(api.projects.update, {
      projectId,
      description: "Launch the site",
    });
    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.description).toBe("Launch the site");
  });

  it("omits description when given an empty string", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      description: "Launch the site",
      color: "#6366f1",
    });
    const before = await asUser.query(api.projects.get, { projectId });
    await asUser.mutation(api.projects.update, {
      projectId,
      description: "",
    });
    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.description).toBeUndefined();
    expect(data.project.userId).toBe(before.project.userId);
    expect(data.project.name).toBe("Website");
    expect(data.project.color).toBe("#6366f1");
    expect(data.project.status).toBe("active");
    expect(data.project.order).toBe(before.project.order);
  });

  it("omits description when clearing a blank value without wiping other fields", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      description: "Launch the site",
      color: "#22c55e",
    });
    const before = await asUser.query(api.projects.get, { projectId });
    await asUser.mutation(api.projects.update, {
      projectId,
      description: "   ",
    });
    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.description).toBeUndefined();
    expect(data.project.userId).toBe(before.project.userId);
    expect(data.project.name).toBe("Website");
    expect(data.project.color).toBe("#22c55e");
    expect(data.project.status).toBe("active");
    expect(data.project.order).toBe(before.project.order);
  });

  it("updates health and sets then clears goalDate", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await asUser.mutation(api.projects.update, {
      projectId,
      health: "offTrack",
      goalDate: "2026-08-15",
    });
    let data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.health).toBe("offTrack");
    expect(data.project.goalDate).toBe("2026-08-15");

    await asUser.mutation(api.projects.update, {
      projectId,
      goalDate: null,
    });
    data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.health).toBe("offTrack");
    expect(data.project.goalDate).toBeUndefined();
  });

  it("rejects invalid health and goalDate on update", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await expect(
      asUser.mutation(api.projects.update, {
        projectId,
        goalDate: "nope",
      }),
    ).rejects.toThrow("Invalid goal date");
  });
});

describe("projects.get", () => {
  it("omits archived tasks from the project task list", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const keepId = await asUser.mutation(api.tasks.create, {
      title: "Keep",
      projectId,
    });
    const hideId = await asUser.mutation(api.tasks.create, {
      title: "Hide",
      projectId,
    });
    await asUser.mutation(api.tasks.update, { taskId: hideId, archived: true });

    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.tasks.map((task) => task._id)).toEqual([keepId]);
  });
});
