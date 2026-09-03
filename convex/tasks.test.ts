import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
    expect(task?.columnId).toBeUndefined();
    expect(task?.completedAt).toBeUndefined();
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
    expect(task?.columnId).toBeUndefined();
    expect(task?.completedAt).toBeUndefined();
  });

  it("stores columnId and priority from create", async () => {
    const { t, asUser } = await createAuthedTest();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    const inProgress = columns.find((c) => c.name === "In-Progress")!;

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Urgent",
      columnId: inProgress._id,
      priority: 3,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.columnId).toBe(inProgress._id);
    expect(task?.priority).toBe(3);
  });

  it("creates a done task with completedAt and persists estimate", async () => {
    const { t, asUser } = await createAuthedTest();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    const done = columns.find((c) => c.isDone)!;

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Already finished",
      columnId: done._id,
      estimateMinutes: 90,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.columnId).toBe(done._id);
    expect(task?.completedAt).toEqual(expect.any(Number));
    expect(task?.estimateMinutes).toBe(90);
  });

  it("rejects another user's columnId", async () => {
    const { asUser, t } = await createAuthedTest();
    const other = t.withIdentity({ subject: "user_other" });
    await other.mutation(api.boardColumns.ensureDefaults, {});
    const foreign = (await other.query(api.boardColumns.list, {}))[0]!;

    await expect(
      asUser.mutation(api.tasks.create, {
        title: "Nope",
        columnId: foreign._id,
      }),
    ).rejects.toThrow("Task not found");
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
        health: "onTrack",
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

  it("sets Done column with completedAt", async () => {
    const { t, asUser } = await createAuthedTest();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const done = (await asUser.query(api.boardColumns.list, {})).find(
      (c) => c.isDone,
    )!;
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });

    await asUser.mutation(api.tasks.update, { taskId, columnId: done._id });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.columnId).toBe(done._id);
    expect(task?.completedAt).toEqual(expect.any(Number));
  });

  it("clears columnId with null", async () => {
    const { t, asUser } = await createAuthedTest();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const inProgress = (await asUser.query(api.boardColumns.list, {})).find(
      (c) => c.name === "In-Progress",
    )!;
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Task",
      columnId: inProgress._id,
    });

    await asUser.mutation(api.tasks.update, { taskId, columnId: null });
    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.columnId).toBeUndefined();
  });

  it("stores a checklist and drops blank items", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Pack",
      notes: "Weekend trip",
      checklist: [
        { id: "a", text: "Passport", done: true },
        { id: "b", text: "  ", done: false },
        { id: "c", text: "Tickets", done: false },
      ],
    });

    const created = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(created?.notes).toBe("Weekend trip");
    expect(created?.archived).toBe(false);
    expect(created?.checklist).toEqual([
      { id: "a", text: "Passport", done: true },
      { id: "c", text: "Tickets", done: false },
    ]);

    await asUser.mutation(api.tasks.update, {
      taskId,
      checklist: [
        { id: "a", text: "Passport", done: true },
        { id: "c", text: "Tickets", done: true },
        { id: "d", text: "", done: false },
      ],
    });
    const updated = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(updated?.checklist).toEqual([
      { id: "a", text: "Passport", done: true },
      { id: "c", text: "Tickets", done: true },
    ]);
  });

  it("rejects duplicate checklist ids", async () => {
    const { asUser } = await createAuthedTest();
    await expect(
      asUser.mutation(api.tasks.create, {
        title: "Dup",
        checklist: [
          { id: "same", text: "One", done: false },
          { id: "same", text: "Two", done: false },
        ],
      }),
    ).rejects.toThrow("Checklist item ids must be unique");
  });

  it("archives a task and hides it from the default list", async () => {
    const { t, asUser } = await createAuthedTest();
    const activeId = await asUser.mutation(api.tasks.create, {
      title: "Keep",
    });
    const archivedId = await asUser.mutation(api.tasks.create, {
      title: "Old",
    });

    await asUser.mutation(api.tasks.update, {
      taskId: archivedId,
      archived: true,
    });

    const archived = await t.run(async (ctx) => ctx.db.get(archivedId));
    expect(archived?.archived).toBe(true);

    const active = await asUser.query(api.tasks.list, {});
    expect(active.map((task) => task._id)).toEqual([activeId]);

    const onlyArchived = await asUser.query(api.tasks.list, {
      archived: true,
    });
    expect(onlyArchived.map((task) => task._id)).toEqual([archivedId]);

    const backlog = await asUser.query(api.backlog.get, {});
    expect(backlog.groups.flatMap((g) => g.tasks.map((task) => task._id))).toEqual(
      [activeId],
    );

    const archivedBacklog = await asUser.query(api.backlog.get, {
      archived: true,
    });
    expect(
      archivedBacklog.groups.flatMap((g) => g.tasks.map((task) => task._id)),
    ).toEqual([archivedId]);

    await asUser.mutation(api.tasks.update, {
      taskId: archivedId,
      archived: false,
    });
    const restored = await t.run(async (ctx) => ctx.db.get(archivedId));
    expect(restored?.archived).toBeUndefined();
  });

  it("rejects updating a task owned by another user", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = "user_other";
    const foreignTaskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: otherUserId,
        title: "Foreign task",
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
      const laterId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Later block",
        start: dayStart + 14 * 3600000,
        end: dayStart + 15 * 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: laterId,
        taskId: taskA,
        order: 0,
      });
      const earlierId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Earlier block",
        start: dayStart + 9 * 3600000,
        end: dayStart + 10 * 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: earlierId,
        taskId: taskB,
        order: 0,
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
      const blockId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Morning work",
        start: dayStart + 9 * 3600000,
        end: dayStart + 10 * 3600000,
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
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const doneCol = (await asUser.query(api.boardColumns.list, {})).find(
      (c) => c.isDone,
    )!;
    await asUser.mutation(api.tasks.update, { taskId, columnId: doneCol._id });

    const today = await asUser.query(api.today.get, {});
    expect(today.tasks.some((t) => t._id === taskId)).toBe(true);
    expect(today.tasks.find((t) => t._id === taskId)?.columnId).toBe(doneCol._id);
    expect(today.tasks.find((t) => t._id === taskId)?.completedAt).toEqual(
      expect.any(Number),
    );
  });

  it("excludes tasks with no blocks today", async () => {
    const { asUser } = await createAuthedTest();

    await asUser.mutation(api.tasks.create, { title: "Backlog only" });

    const today = await asUser.query(api.today.get, {});
    expect(today.tasks).toHaveLength(0);
  });
});

describe("tasks.remove", () => {
  it("removes memberships and schedule-deletes sittings that become empty", async () => {
    vi.useFakeTimers();
    try {
      const { t, asUser, userId } = await createAuthedTest();
      const taskId = await asUser.mutation(api.tasks.create, { title: "Solo" });
      const blockId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("timeBlocks", {
          userId,
          title: "Solo sitting",
          start: Date.now(),
          end: Date.now() + 3600000,
          origin: "app",
          googleEventId: "evt_solo",
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

      await asUser.mutation(api.tasks.remove, { taskId });

      expect(await t.run(async (ctx) => ctx.db.get(taskId))).toBeNull();
      const memberships = await t.run(async (ctx) =>
        ctx.db
          .query("timeBlockTasks")
          .withIndex("by_block", (q) => q.eq("blockId", blockId))
          .collect(),
      );
      expect(memberships).toHaveLength(0);

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

  it("keeps a sitting that still has another task", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const keepId = await asUser.mutation(api.tasks.create, { title: "Keep" });
    const dropId = await asUser.mutation(api.tasks.create, { title: "Drop" });
    const blockId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Shared sitting",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: id,
        taskId: keepId,
        order: 0,
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: id,
        taskId: dropId,
        order: 1,
      });
      return id;
    });

    await asUser.mutation(api.tasks.remove, { taskId: dropId });

    expect(await t.run(async (ctx) => ctx.db.get(dropId))).toBeNull();
    const memberships = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    expect(memberships.map((row) => row.taskId)).toEqual([keepId]);
    const block = await t.run(async (ctx) => ctx.db.get(blockId));
    expect(block).toBeTruthy();
    expect(block?.syncState).toBe("synced");
  });
});

describe("tasks.moveOnBoard", () => {
  async function seedColumns(
    asUser: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  ) {
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    const inProgress = columns.find((c) => c.name === "In-Progress")!;
    const test = columns.find((c) => c.name === "Test")!;
    const done = columns.find((c) => c.isDone)!;
    return { inProgress, test, done };
  }

  async function seedThree(
    t: ReturnType<typeof convexTest>,
    userId: string,
    cols: {
      inProgress: { _id: Id<"boardColumns"> };
      test: { _id: Id<"boardColumns"> };
    },
  ) {
    const a = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "A",
        columnId: cols.inProgress._id,
        order: 0,
      }),
    );
    const b = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "B",
        columnId: cols.inProgress._id,
        order: 1,
      }),
    );
    const c = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "C",
        columnId: cols.test._id,
        order: 2,
      }),
    );
    return { a, b, c };
  }

  it("moves a task to another column and appends", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const { a, c } = await seedThree(t, userId, cols);

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: a,
      columnId: cols.test._id,
    });

    const moved = await t.run(async (ctx) => ctx.db.get(a));
    const destMate = await t.run(async (ctx) => ctx.db.get(c));
    expect(moved?.columnId).toBe(cols.test._id);
    expect(moved?.order).toBe(1);
    expect(destMate?.order).toBe(0);
  });

  it("inserts before a destination card", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const { a, c } = await seedThree(t, userId, cols);

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: a,
      columnId: cols.test._id,
      beforeTaskId: c,
    });

    const moved = await t.run(async (ctx) => ctx.db.get(a));
    const destMate = await t.run(async (ctx) => ctx.db.get(c));
    expect(moved?.order).toBe(0);
    expect(destMate?.order).toBe(1);
  });

  it("reorders within a column without touching other columns", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const { a, b, c } = await seedThree(t, userId, cols);

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: b,
      columnId: cols.inProgress._id,
      beforeTaskId: a,
    });

    expect((await t.run(async (ctx) => ctx.db.get(b)))?.order).toBe(0);
    expect((await t.run(async (ctx) => ctx.db.get(a)))?.order).toBe(1);
    expect((await t.run(async (ctx) => ctx.db.get(c)))?.order).toBe(2);
  });

  it("sets completedAt when moving to done and clears it when leaving", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Finish",
        columnId: cols.test._id,
        order: 0,
      }),
    );

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId,
      columnId: cols.done._id,
    });
    let task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.completedAt).toEqual(expect.any(Number));

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId,
      columnId: cols.test._id,
    });
    task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.completedAt).toBeUndefined();
  });

  it("rejects another user's task", async () => {
    const { t, asUser } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const foreignId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: "user_other",
        title: "Nope",
        columnId: cols.inProgress._id,
        order: 0,
      }),
    );

    await expect(
      asUser.mutation(api.tasks.moveOnBoard, {
        taskId: foreignId,
        columnId: cols.test._id,
      }),
    ).rejects.toThrow("Task not found");
  });

  it("rejects beforeTaskId in the wrong column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const { a, c } = await seedThree(t, userId, cols);

    await expect(
      asUser.mutation(api.tasks.moveOnBoard, {
        taskId: a,
        columnId: cols.done._id,
        beforeTaskId: c,
      }),
    ).rejects.toThrow("Invalid drop target");
  });

  it("appends onto an empty destination column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const { a } = await seedThree(t, userId, cols);

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: a,
      columnId: cols.done._id,
    });

    const moved = await t.run(async (ctx) => ctx.db.get(a));
    expect(moved?.columnId).toBe(cols.done._id);
    expect(moved?.order).toBe(0);
  });

  it("rejects beforeTaskId equal to the moved task", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const { a } = await seedThree(t, userId, cols);

    await expect(
      asUser.mutation(api.tasks.moveOnBoard, {
        taskId: a,
        columnId: cols.inProgress._id,
        beforeTaskId: a,
      }),
    ).rejects.toThrow("Invalid drop target");
  });

  it("keeps completedAt when reordering within done", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const completedAt = 1_700_000_000_000;
    const first = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Done first",
        columnId: cols.done._id,
        order: 0,
        completedAt,
      }),
    );
    const second = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Done second",
        columnId: cols.done._id,
        order: 1,
        completedAt: completedAt + 1,
      }),
    );

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: second,
      columnId: cols.done._id,
      beforeTaskId: first,
    });

    expect((await t.run(async (ctx) => ctx.db.get(second)))?.completedAt).toBe(
      completedAt + 1,
    );
    expect((await t.run(async (ctx) => ctx.db.get(first)))?.completedAt).toBe(
      completedAt,
    );
    expect((await t.run(async (ctx) => ctx.db.get(second)))?.order).toBe(0);
    expect((await t.run(async (ctx) => ctx.db.get(first)))?.order).toBe(1);
  });

  it("moves to Backlog when columnId is null", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const { a } = await seedThree(t, userId, cols);

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: a,
      columnId: null,
    });

    const moved = await t.run(async (ctx) => ctx.db.get(a));
    expect(moved?.columnId).toBeUndefined();
  });
});
