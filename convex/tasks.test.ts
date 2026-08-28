import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("tasks.create", () => {
  it("creates a backlog task", async () => {
    const { t, asUser } = await createAuthedTest();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Write spec",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("backlog");
  });

  it("stores estimateMinutes and due date", async () => {
    const { t, asUser } = await createAuthedTest();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "File taxes",
      dueDate: "2030-04-15",
      estimateMinutes: 300,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.dueDate).toBe("2030-04-15");
    expect(task?.estimateMinutes).toBe(300);
    expect(task?.status).toBe("backlog");
  });

  it("rejects a project owned by another user", async () => {
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
      asUser.mutation(api.tasks.create, {
        title: "Nope",
        projectId: foreignProjectId,
      }),
    ).rejects.toThrow("Project not found");
  });
});

describe("tasks.update", () => {
  it("stores a numeric priority and clears it with null", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });

    await asUser.mutation(api.tasks.update, { taskId, priority: 3 });
    let task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.priority).toBe(3);

    await asUser.mutation(api.tasks.update, { taskId, priority: null });
    task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.priority).toBeUndefined();
  });

  it("updates estimateMinutes", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });

    await asUser.mutation(api.tasks.update, {
      taskId,
      estimateMinutes: 120,
    });

    let task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.estimateMinutes).toBe(120);

    await asUser.mutation(api.tasks.update, { taskId, estimateMinutes: null });
    task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.estimateMinutes).toBeUndefined();
  });

  it("sets status to done with completedAt", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });

    await asUser.mutation(api.tasks.update, { taskId, status: "done" });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("done");
    expect(task?.completedAt).toEqual(expect.any(Number));
  });

  it("rejects updating a task owned by another user", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = "user_other";
    const foreignTaskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: otherUserId,
        title: "Foreign task",
        status: "backlog",
        order: 0,
      }),
    );

    await expect(
      asUser.mutation(api.tasks.update, {
        taskId: foreignTaskId,
        title: "Hijack",
      }),
    ).rejects.toThrow("Task not found");
  });
});

describe("today.get", () => {
  it("derives tasks from today's blocks ordered by first block start", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const { formatDateKey, startOfDayMs } = await import("./lib/dates");
    const dayStart = startOfDayMs(formatDateKey());

    const taskA = await asUser.mutation(api.tasks.create, { title: "A" });
    const taskB = await asUser.mutation(api.tasks.create, { title: "B" });

    await t.run(async (ctx) => {
      await ctx.db.insert("timeBlocks", {
        userId,
        title: "Later block",
        start: dayStart + 14 * 3600000,
        end: dayStart + 15 * 3600000,
        taskId: taskA,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlocks", {
        userId,
        title: "Earlier block",
        start: dayStart + 9 * 3600000,
        end: dayStart + 10 * 3600000,
        taskId: taskB,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
    });

    const today = await asUser.query(api.today.get, {});
    expect(today.tasks.map((t) => t._id)).toEqual([taskB, taskA]);
  });

  it("includes done tasks that have blocks today", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const { formatDateKey, startOfDayMs } = await import("./lib/dates");
    const dayStart = startOfDayMs(formatDateKey());

    const taskId = await asUser.mutation(api.tasks.create, { title: "Done" });
    await t.run(async (ctx) => {
      await ctx.db.insert("timeBlocks", {
        userId,
        title: "Morning work",
        start: dayStart + 9 * 3600000,
        end: dayStart + 10 * 3600000,
        taskId,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
    });
    await asUser.mutation(api.tasks.update, { taskId, status: "done" });

    const today = await asUser.query(api.today.get, {});
    expect(today.tasks.some((t) => t._id === taskId)).toBe(true);
    expect(today.tasks.find((t) => t._id === taskId)?.status).toBe("done");
  });

  it("excludes tasks with no blocks today", async () => {
    const { asUser } = await createAuthedTest();

    await asUser.mutation(api.tasks.create, { title: "Backlog only" });

    const today = await asUser.query(api.today.get, {});
    expect(today.tasks).toHaveLength(0);
  });
});
