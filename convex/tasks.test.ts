import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { formatDateKey } from "./lib/dates";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "test@example.com", name: "Test User" }),
  );
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("tasks.create", () => {
  it("creates a backlog task when no scheduled date is given", async () => {
    const { t, asUser } = await createAuthedTest();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Write spec",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("backlog");
    expect(task?.scheduledDate).toBeUndefined();
  });

  it("creates a today task when scheduled for today", async () => {
    const { t, asUser } = await createAuthedTest();
    const today = formatDateKey();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Review PR",
      scheduledDate: today,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("today");
    expect(task?.scheduledDate).toBe(today);
  });

  it("creates a today task when scheduled for a future date", async () => {
    const { t, asUser } = await createAuthedTest();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Plan trip",
      scheduledDate: "2030-01-15",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("today");
    expect(task?.scheduledDate).toBe("2030-01-15");
  });

  it("stores a due date without affecting status", async () => {
    const { t, asUser } = await createAuthedTest();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "File taxes",
      dueDate: "2030-04-15",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.dueDate).toBe("2030-04-15");
    expect(task?.status).toBe("backlog");
    expect(task?.scheduledDate).toBeUndefined();
  });

  it("rejects a project owned by another user", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
    );
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
  it("sets status to today when a scheduled date is set", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });

    await asUser.mutation(api.tasks.update, {
      taskId,
      scheduledDate: "2030-02-01",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.scheduledDate).toBe("2030-02-01");
    expect(task?.status).toBe("today");
  });

  it("sends the task to backlog when the scheduled date is cleared", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Scheduled task",
      scheduledDate: "2030-02-01",
    });

    await asUser.mutation(api.tasks.update, {
      taskId,
      scheduledDate: null,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.scheduledDate).toBeUndefined();
    expect(task?.status).toBe("backlog");
  });

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

  it("does not touch status when scheduledDate is omitted", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Scheduled task",
      scheduledDate: "2030-02-01",
    });

    await asUser.mutation(api.tasks.update, { taskId, title: "Renamed" });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.title).toBe("Renamed");
    expect(task?.status).toBe("today");
    expect(task?.scheduledDate).toBe("2030-02-01");
  });

  it("rejects updating a task owned by another user", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
    );
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
