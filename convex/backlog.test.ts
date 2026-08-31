import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
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
    status:
      | "backlog"
      | "investigate"
      | "in-progress"
      | "review"
      | "test"
      | "done";
    order: number;
    projectId?: Id<"projects">;
  },
) {
  return t.run(async (ctx) =>
    ctx.db.insert("tasks", {
      userId,
      title: fields.title,
      status: fields.status,
      order: fields.order,
      ...(fields.projectId ? { projectId: fields.projectId } : {}),
    }),
  );
}

describe("backlog.board", () => {
  it("returns five columns in workflow order including empties", async () => {
    const { asUser } = await createAuthedTest();
    const board = await asUser.query(api.backlog.board, {});
    expect(board.columns.map((c) => c.status)).toEqual([
      "investigate",
      "in-progress",
      "review",
      "test",
      "done",
    ]);
    expect(board.total).toBe(0);
    expect(board.columns.every((c) => c.tasks.length === 0)).toBe(true);
  });

  it("excludes backlog status and includes done", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    await insertTask(t, userId, { title: "Parked", status: "backlog", order: 0 });
    await insertTask(t, userId, {
      title: "Shipped",
      status: "done",
      order: 1,
    });
    await insertTask(t, userId, {
      title: "Looking",
      status: "investigate",
      order: 2,
    });

    const board = await asUser.query(api.backlog.board, {});
    expect(board.total).toBe(2);
    const titles = board.columns.flatMap((c) => c.tasks.map((task) => task.title));
    expect(titles).toEqual(["Looking", "Shipped"]);
    expect(board.columns.find((c) => c.status === "done")?.tasks[0]?.title).toBe(
      "Shipped",
    );
  });

  it("sorts a column by order then _id", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    await insertTask(t, userId, {
      title: "Second",
      status: "review",
      order: 5,
    });
    await insertTask(t, userId, {
      title: "First",
      status: "review",
      order: 1,
    });

    const board = await asUser.query(api.backlog.board, {});
    const review = board.columns.find((c) => c.status === "review")!;
    expect(review.tasks.map((task) => task.title)).toEqual(["First", "Second"]);
  });

  it("does not return another user's tasks", async () => {
    const { t, asUser } = await createAuthedTest();
    await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: "user_other",
        title: "Secret",
        status: "investigate",
        order: 0,
      }),
    );

    const board = await asUser.query(api.backlog.board, {});
    expect(board.total).toBe(0);
  });

  it("enriches project and active from block memberships", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const taskId = await insertTask(t, userId, {
      title: "Wireframes",
      status: "in-progress",
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
    const task = board.columns
      .find((c) => c.status === "in-progress")
      ?.tasks[0];
    expect(task?.project?.name).toBe("Website");
    expect(task?.active).toBe(true);
    expect(task?.stats.blockCount).toBe(1);
  });
});
