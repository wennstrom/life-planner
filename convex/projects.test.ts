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

async function insertTask(
  t: ReturnType<typeof convexTest>,
  userId: string,
  fields: {
    title: string;
    columnId?: Id<"boardColumns">;
    order: number;
    projectId?: Id<"projects">;
  },
) {
  return t.run(async (ctx) =>
    ctx.db.insert("tasks", {
      userId,
      title: fields.title,
      order: fields.order,
      ...(fields.columnId ? { columnId: fields.columnId } : {}),
      ...(fields.projectId ? { projectId: fields.projectId } : {}),
    }),
  );
}

async function seedColumns(
  asUser: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
) {
  await asUser.mutation(api.boardColumns.ensureDefaults, {});
  const columns = await asUser.query(api.boardColumns.list, {});
  return {
    inProgress: columns.find((c) => c.name === "In-Progress")!,
    test: columns.find((c) => c.name === "Test")!,
    done: columns.find((c) => c.isDone)!,
  };
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

  it("omits health when omitted", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.health).toBeUndefined();
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

    await asUser.mutation(api.projects.update, {
      projectId,
      health: null,
    });
    data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.health).toBeUndefined();
    expect(data.project.name).toBe("Website");
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

describe("projects.placeOnBoard", () => {
  it("assigns unassigned and stale-column tasks to the first named column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const other = await asUser.mutation(api.projects.create, {
      name: "Other",
      color: "#3b82f6",
    });
    const parked = await insertTask(t, userId, {
      title: "Parked",
      order: 0,
      projectId: website,
    });
    const staleId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("boardColumns", {
        userId,
        name: "Gone",
        color: "#14b8a6",
        order: 99,
        isDone: false,
      });
      await ctx.db.delete(id);
      return id;
    });
    const orphan = await insertTask(t, userId, {
      title: "Orphan",
      columnId: staleId,
      order: 1,
      projectId: website,
    });
    const already = await insertTask(t, userId, {
      title: "Doing",
      columnId: cols.test._id,
      order: 2,
      projectId: website,
    });
    const otherParked = await insertTask(t, userId, {
      title: "Else",
      order: 3,
      projectId: other,
    });

    await asUser.mutation(api.projects.placeOnBoard, { projectId: website });

    expect((await t.run(async (ctx) => ctx.db.get(parked)))?.columnId).toBe(
      cols.inProgress._id,
    );
    expect((await t.run(async (ctx) => ctx.db.get(orphan)))?.columnId).toBe(
      cols.inProgress._id,
    );
    expect((await t.run(async (ctx) => ctx.db.get(already)))?.columnId).toBe(
      cols.test._id,
    );
    expect(
      (await t.run(async (ctx) => ctx.db.get(otherParked)))?.columnId,
    ).toBeUndefined();
  });

  it("is a no-op when every task already has a named column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const taskId = await insertTask(t, userId, {
      title: "Doing",
      columnId: cols.test._id,
      order: 0,
      projectId: website,
    });
    await asUser.mutation(api.projects.placeOnBoard, { projectId: website });
    expect((await t.run(async (ctx) => ctx.db.get(taskId)))?.columnId).toBe(
      cols.test._id,
    );
  });

  it("throws No board columns when the user has none", async () => {
    const { asUser } = await createAuthedTest();
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await expect(
      asUser.mutation(api.projects.placeOnBoard, { projectId: website }),
    ).rejects.toThrow("No board columns");
  });
});

describe("projects.update validation", () => {
  it("rejects an invalid color", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await expect(
      asUser.mutation(api.projects.update, {
        projectId,
        color: "#ffffff",
      }),
    ).rejects.toThrow("Invalid project color");
  });

  it("rejects an empty name", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await expect(
      asUser.mutation(api.projects.update, {
        projectId,
        name: "   ",
      }),
    ).rejects.toThrow("Name is required");
  });
});

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 21, 12); // Wednesday
const WEEK = {
  weekStartMs: Date.UTC(2026, 9, 19),
  weekEndMs: Date.UTC(2026, 9, 26),
  nowMs: NOW,
};

async function insertBlock(
  t: ReturnType<typeof convexTest>,
  userId: string,
  fields: {
    start: number;
    minutes: number;
    taskIds: Array<Id<"tasks">>;
    reviews?: Array<
      | {
          actualMinutes: number;
          focus?: "deep" | "shallow" | "interrupted";
          nextStep?: string;
          reviewedAt?: number;
        }
      | undefined
    >;
  },
) {
  return t.run(async (ctx) => {
    const blockId = await ctx.db.insert("timeBlocks", {
      userId,
      title: "Block",
      start: fields.start,
      end: fields.start + fields.minutes * 60000,
      origin: "app",
      syncState: "synced",
      updatedAt: fields.start,
    });
    for (const [order, taskId] of fields.taskIds.entries()) {
      const review = fields.reviews?.[order];
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId,
        taskId,
        order,
        ...(review
          ? {
              review: {
                outcome: "done" as const,
                actualMinutes: review.actualMinutes,
                focus: review.focus,
                nextStep: review.nextStep,
                reviewedAt: review.reviewedAt ?? fields.start,
              },
            }
          : {}),
      });
    }
    return blockId;
  });
}

describe("projects.stats", () => {
  it("splits a mixed block across projects and counts only reviewed time as spent", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const web = await asUser.mutation(api.projects.create, {
      name: "Web",
      color: "#6366f1",
    });
    const app = await asUser.mutation(api.projects.create, {
      name: "App",
      color: "#6366f1",
    });
    const w1 = await insertTask(t, userId, { title: "W1", order: 0, projectId: web });
    const w2 = await insertTask(t, userId, { title: "W2", order: 1, projectId: web });
    const a1 = await insertTask(t, userId, { title: "A1", order: 0, projectId: app });

    await insertBlock(t, userId, {
      start: NOW - 2 * HOUR,
      minutes: 90,
      taskIds: [w1, w2, a1],
      reviews: [
        { actualMinutes: 30, focus: "deep" },
        { actualMinutes: 20, focus: "shallow" },
        undefined,
      ],
    });
    // Last week: counts toward all-time only.
    await insertBlock(t, userId, {
      start: WEEK.weekStartMs - 24 * HOUR,
      minutes: 60,
      taskIds: [w1],
      reviews: [{ actualMinutes: 45, focus: "interrupted" }],
    });

    const stats = await asUser.query(api.projects.stats, WEEK);
    expect(stats[web].plannedWeekMinutes).toBe(60);
    expect(stats[app].plannedWeekMinutes).toBe(30);
    expect(stats[web].spentWeekMinutes).toBe(50);
    expect(stats[web].spentAllTimeMinutes).toBe(95);
    expect(stats[web].focusAllTime).toEqual({ deep: 30, shallow: 20, other: 45 });
    expect(stats[web].focusWeek).toEqual({ deep: 30, shallow: 20, other: 0 });
    expect(stats[app].spentAllTimeMinutes).toBe(0);
    expect(stats[web].lastBlockStart).toBe(NOW - 2 * HOUR);
  });

  it("moves history with the task when it changes project", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const web = await asUser.mutation(api.projects.create, {
      name: "Web",
      color: "#6366f1",
    });
    const app = await asUser.mutation(api.projects.create, {
      name: "App",
      color: "#6366f1",
    });
    const taskId = await insertTask(t, userId, { title: "T", order: 0, projectId: web });
    await insertBlock(t, userId, {
      start: NOW - HOUR,
      minutes: 60,
      taskIds: [taskId],
      reviews: [{ actualMinutes: 60 }],
    });
    await t.run(async (ctx) => ctx.db.patch("tasks", taskId, { projectId: app }));

    const stats = await asUser.query(api.projects.stats, WEEK);
    expect(stats[web].spentAllTimeMinutes).toBe(0);
    expect(stats[app].spentAllTimeMinutes).toBe(60);
  });

  it("tracks the next block, remaining work, next action and latest next step", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const web = await asUser.mutation(api.projects.create, {
      name: "Web",
      color: "#6366f1",
    });
    const backlogTask = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Backlog",
        order: 0,
        projectId: web,
        estimateMinutes: 120,
      }),
    );
    const doing = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Doing",
        order: 3,
        projectId: web,
        columnId: cols.inProgress._id,
      }),
    );
    const finished = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Finished",
        order: 0,
        projectId: web,
        columnId: cols.done._id,
        estimateMinutes: 600,
      }),
    );

    await insertBlock(t, userId, {
      start: NOW - 3 * HOUR,
      minutes: 60,
      taskIds: [backlogTask],
      reviews: [{ actualMinutes: 50, nextStep: "Write intro", reviewedAt: NOW - 2 * HOUR }],
    });
    await insertBlock(t, userId, {
      start: NOW - 2 * HOUR,
      minutes: 30,
      taskIds: [finished],
      reviews: [{ actualMinutes: 30, nextStep: "Ship it", reviewedAt: NOW - HOUR }],
    });
    await insertBlock(t, userId, {
      start: NOW + 24 * HOUR,
      minutes: 60,
      taskIds: [doing],
    });

    const stats = await asUser.query(api.projects.statsFor, {
      projectId: web,
      ...WEEK,
    });
    expect(stats.nextBlockStart).toBe(NOW + 24 * HOUR);
    expect(stats.nextAction).toEqual({ taskId: doing, title: "Doing" });
    expect(stats.latestNextStep).toMatchObject({
      taskId: backlogTask,
      text: "Write intro",
    });
    expect(stats.remaining).toEqual({
      estimatedMinutes: 70,
      unestimatedCount: 1,
      openCount: 2,
    });
  });

  it("rejects another user's project", async () => {
    const { t, asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Web",
      color: "#6366f1",
    });
    const other = t.withIdentity({ subject: "user_other" });
    await expect(
      other.query(api.projects.statsFor, { projectId, ...WEEK }),
    ).rejects.toThrow("Project not found");
  });
});

describe("projects.log", () => {
  it("returns past blocks for the project, newest first, capped by limit", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const web = await asUser.mutation(api.projects.create, {
      name: "Web",
      color: "#6366f1",
    });
    const w1 = await insertTask(t, userId, { title: "W1", order: 0, projectId: web });
    const w2 = await insertTask(t, userId, { title: "W2", order: 1, projectId: web });
    const loose = await insertTask(t, userId, { title: "Loose", order: 2 });

    const older = await insertBlock(t, userId, {
      start: NOW - 5 * HOUR,
      minutes: 60,
      taskIds: [w1],
    });
    const shared = await insertBlock(t, userId, {
      start: NOW - 2 * HOUR,
      minutes: 60,
      taskIds: [w1, w2],
    });
    await insertBlock(t, userId, { start: NOW - HOUR, minutes: 30, taskIds: [loose] });
    await insertBlock(t, userId, { start: NOW + HOUR, minutes: 30, taskIds: [w1] });

    const all = await asUser.query(api.projects.log, {
      projectId: web,
      nowMs: NOW,
    });
    expect(all.blocks.map((b) => b._id)).toEqual([shared, older]);
    expect(all.hasMore).toBe(false);
    expect(all.blocks[0].memberships.every((m) => m.projectId === web)).toBe(true);

    const capped = await asUser.query(api.projects.log, {
      projectId: web,
      nowMs: NOW,
      limit: 1,
    });
    expect(capped.blocks.map((b) => b._id)).toEqual([shared]);
    expect(capped.hasMore).toBe(true);
  });

  it("rejects another user's project", async () => {
    const { t, asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Web",
      color: "#6366f1",
    });
    const other = t.withIdentity({ subject: "user_other" });
    await expect(
      other.query(api.projects.log, { projectId, nowMs: NOW }),
    ).rejects.toThrow("Project not found");
  });
});

describe("projects.update healthNote", () => {
  async function setup() {
    const { t, asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Web",
      color: "#6366f1",
      health: "atRisk",
    });
    const read = () => t.run(async (ctx) => ctx.db.get("projects", projectId));
    return { asUser, projectId, read };
  }

  it("trims and stores the note", async () => {
    const { asUser, projectId, read } = await setup();
    await asUser.mutation(api.projects.update, {
      projectId,
      healthNote: "  waiting on API access ",
    });
    expect((await read())?.healthNote).toBe("waiting on API access");
  });

  it("clears on empty string or null", async () => {
    const { asUser, projectId, read } = await setup();
    await asUser.mutation(api.projects.update, { projectId, healthNote: "x" });
    await asUser.mutation(api.projects.update, { projectId, healthNote: "  " });
    expect((await read())?.healthNote).toBeUndefined();
    await asUser.mutation(api.projects.update, { projectId, healthNote: "x" });
    await asUser.mutation(api.projects.update, { projectId, healthNote: null });
    expect((await read())?.healthNote).toBeUndefined();
  });

  it("keeps the note when health changes and clears it when health is cleared", async () => {
    const { asUser, projectId, read } = await setup();
    await asUser.mutation(api.projects.update, { projectId, healthNote: "x" });
    await asUser.mutation(api.projects.update, { projectId, health: "offTrack" });
    expect((await read())?.healthNote).toBe("x");
    await asUser.mutation(api.projects.update, { projectId, health: null });
    const project = await read();
    expect(project?.health).toBeUndefined();
    expect(project?.healthNote).toBeUndefined();
  });

  it("ignores a note when the project has no health", async () => {
    const { asUser, projectId, read } = await setup();
    await asUser.mutation(api.projects.update, { projectId, health: null });
    await asUser.mutation(api.projects.update, { projectId, healthNote: "x" });
    expect((await read())?.healthNote).toBeUndefined();
  });

  it("rejects notes over 140 characters", async () => {
    const { asUser, projectId } = await setup();
    await expect(
      asUser.mutation(api.projects.update, {
        projectId,
        healthNote: "a".repeat(141),
      }),
    ).rejects.toThrow("Health note is too long");
  });
});
