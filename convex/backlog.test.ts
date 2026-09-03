import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BACKLOG_COLUMN_COLOR } from "./lib/boardColumnColors";
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

describe("backlog.get", () => {
  it("returns Backlog, In-Progress, and Done in one set", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    await insertTask(t, userId, { title: "Parked", order: 0 });
    await insertTask(t, userId, {
      title: "Doing",
      columnId: cols.inProgress._id,
      order: 1,
    });
    await insertTask(t, userId, {
      title: "Shipped",
      columnId: cols.done._id,
      order: 2,
    });

    const backlog = await asUser.query(api.backlog.get, {});
    expect(backlog.total).toBe(3);
    expect(
      backlog.groups.flatMap((g) => g.tasks.map((task) => task.title)).sort(),
    ).toEqual(["Doing", "Parked", "Shipped"]);
  });

  it("excludes archived tasks from the default view", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    await insertTask(t, userId, { title: "Keep", order: 0 });
    const archivedId = await insertTask(t, userId, {
      title: "Old",
      order: 1,
    });
    await asUser.mutation(api.tasks.update, {
      taskId: archivedId,
      archived: true,
    });

    const backlog = await asUser.query(api.backlog.get, {});
    expect(
      backlog.groups.flatMap((g) => g.tasks.map((task) => task.title)),
    ).toEqual(["Keep"]);

    const archived = await asUser.query(api.backlog.get, { archived: true });
    expect(
      archived.groups.flatMap((g) => g.tasks.map((task) => task.title)),
    ).toEqual(["Old"]);
  });

  it("groups by project including No project", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await insertTask(t, userId, { title: "Loose", order: 0 });
    await insertTask(t, userId, {
      title: "Owned",
      order: 1,
      projectId,
    });

    const backlog = await asUser.query(api.backlog.get, {});
    expect(backlog.groups.map((g) => g.label).sort()).toEqual([
      "No project",
      "Website",
    ]);
  });
});

describe("backlog.board", () => {
  it("returns Backlog plus default columns including empties", async () => {
    const { asUser } = await createAuthedTest();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const board = await asUser.query(api.backlog.board, {});
    expect(board.columns[0]?.isBacklog).toBe(true);
    expect(board.columns[0]?.color).toBe(BACKLOG_COLUMN_COLOR);
    expect(board.columns.at(-1)?.isDone).toBe(true);
    expect(board.columns.map((c) => c.name)).toEqual([
      "Backlog",
      "In-Progress",
      "Test",
      "Done",
    ]);
    expect(board.columns.find((c) => c.name === "Test")?.tasks).toEqual([]);
  });

  it("puts unset columnId in Backlog and keeps Done", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    await insertTask(t, userId, { title: "Parked", order: 0 });
    await insertTask(t, userId, {
      title: "Shipped",
      columnId: cols.done._id,
      order: 1,
    });
    await insertTask(t, userId, {
      title: "Doing",
      columnId: cols.inProgress._id,
      order: 2,
    });

    const board = await asUser.query(api.backlog.board, {});
    expect(board.total).toBe(3);
    expect(board.columns[0]?.tasks[0]?.title).toBe("Parked");
    expect(board.columns.find((c) => c.isDone)?.tasks[0]?.title).toBe("Shipped");
  });

  it("sorts a column by order then _id", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    await insertTask(t, userId, {
      title: "Second",
      columnId: cols.test._id,
      order: 5,
    });
    await insertTask(t, userId, {
      title: "First",
      columnId: cols.test._id,
      order: 1,
    });

    const board = await asUser.query(api.backlog.board, {});
    const test = board.columns.find((c) => c.name === "Test")!;
    expect(test.tasks.map((task) => task.title)).toEqual(["First", "Second"]);
  });

  it("does not return another user's tasks", async () => {
    const { t, asUser } = await createAuthedTest();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: "user_other",
        title: "Secret",
        order: 0,
      }),
    );

    const board = await asUser.query(api.backlog.board, {});
    expect(board.total).toBe(0);
  });

  it("marks done tasks inactive even with time-block memberships", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const taskId = await insertTask(t, userId, {
      title: "Wireframes",
      columnId: cols.done._id,
      order: 0,
      projectId,
    });
    await t.run(async (ctx) => {
      const blockId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Focus",
        start: Date.now(),
        end: Date.now() + 3600000,
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

    const board = await asUser.query(api.backlog.board, {});
    const task = board.columns.find((c) => c.isDone)?.tasks[0];
    expect(task?.project?.name).toBe("Website");
    expect(task?.isDone).toBe(true);
    expect(task?.active).toBe(false);
    expect(task?.stats.blockCount).toBe(1);
  });

  it("returns only Backlog when the user has zero columns", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    await insertTask(t, userId, { title: "Loose", order: 0 });
    const board = await asUser.query(api.backlog.board, {});
    expect(board.columns.map((c) => c.name)).toEqual(["Backlog"]);
    expect(board.columns[0]?.tasks[0]?.title).toBe("Loose");
  });

  it("when projectId is set, returns only that project's named-column tasks", async () => {
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
    await insertTask(t, userId, {
      title: "Site doing",
      columnId: cols.inProgress._id,
      order: 0,
      projectId: website,
    });
    await insertTask(t, userId, {
      title: "Other doing",
      columnId: cols.inProgress._id,
      order: 1,
      projectId: other,
    });
    await insertTask(t, userId, {
      title: "Site parked",
      order: 2,
      projectId: website,
    });

    const board = await asUser.query(api.backlog.board, {
      projectId: website,
    });
    expect(board.columns.map((c) => c.name)).toEqual([
      "Backlog",
      "In-Progress",
      "Test",
      "Done",
    ]);
    expect(board.columns[0]?.isBacklog).toBe(true);
    expect(
      board.columns.flatMap((c) => c.tasks.map((task) => task.title)),
    ).toEqual(["Site parked", "Site doing"]);
    expect(board.total).toBe(2);
  });

  it("when projectId is set, omits stale columnId tasks from every column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
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
    await insertTask(t, userId, {
      title: "Orphan",
      columnId: staleId,
      order: 0,
      projectId: website,
    });
    await insertTask(t, userId, {
      title: "Doing",
      columnId: cols.inProgress._id,
      order: 1,
      projectId: website,
    });

    const board = await asUser.query(api.backlog.board, {
      projectId: website,
    });
    expect(
      board.columns.find((c) => c.isBacklog)?.tasks.map((task) => task.title),
    ).toEqual(["Orphan"]);
    expect(
      board.columns.flatMap((c) => c.tasks.map((task) => task.title)),
    ).toEqual(["Orphan", "Doing"]);
  });

  it("throws Project not found for another user's projectId", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherProjectId = await t
      .withIdentity({ subject: "user_other" })
      .mutation(api.projects.create, {
        name: "Secret",
        color: "#6366f1",
      });
    await expect(
      asUser.query(api.backlog.board, { projectId: otherProjectId }),
    ).rejects.toThrow("Project not found");
  });
});
