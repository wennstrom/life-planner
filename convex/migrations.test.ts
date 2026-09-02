import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  membershipFromLegacyBlock,
  membershipsToInsertFromLegacyBlocks,
  omitLegacyTimeBlockFields,
  assertSafeToClearLegacyTimeBlockFields,
} from "./migrations";
import schema from "./schema";
import { modules } from "./test.setup";

type LegacyTimeBlockFields = {
  taskId?: Id<"tasks">;
  review?: {
    outcome: "done" | "partial" | "missed";
    actualMinutes: number;
    reviewedAt: number;
  };
};

const sampleReview = {
  outcome: "partial" as const,
  actualMinutes: 20,
  reviewedAt: 1,
};

describe("migrations.dropScheduledDate", () => {
  it("is safe to run on already-migrated backlog tasks", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";

    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", {
        userId,
        title: "Backlog task",
        order: 0,
      });
    });

    await t.mutation(internal.migrations.dropScheduledDate, {});

    const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Backlog task");
  });
});

describe("membershipsToInsertFromLegacyBlocks", () => {
  it("copies leftover taskId/review and is idempotent", () => {
    const taskId = "jd7task" as Id<"tasks">;
    const blockId = "jd7block" as Id<"timeBlocks">;
    const block = {
      _id: blockId,
      userId: "user_test1",
      taskId,
      review: sampleReview,
    };

    const first = membershipsToInsertFromLegacyBlocks([block], []);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      userId: "user_test1",
      blockId,
      taskId,
      order: 0,
      review: sampleReview,
    });

    const second = membershipsToInsertFromLegacyBlocks([block], first);
    expect(second).toHaveLength(0);

    expect(
      membershipsToInsertFromLegacyBlocks(
        [{ _id: blockId, userId: "user_test1" }],
        [],
      ),
    ).toHaveLength(0);
  });
});

describe("omitLegacyTimeBlockFields", () => {
  it("drops taskId and review from a document that still has them", () => {
    const rest = omitLegacyTimeBlockFields({
      _id: "jd7block" as Id<"timeBlocks">,
      _creationTime: 1,
      userId: "user_test1",
      title: "Old sitting",
      start: 1,
      end: 2,
      origin: "app" as const,
      syncState: "synced" as const,
      updatedAt: 1,
      taskId: "jd7task" as Id<"tasks">,
      review: sampleReview,
    });
    expect(rest).not.toHaveProperty("taskId");
    expect(rest).not.toHaveProperty("review");
    expect(rest).not.toHaveProperty("_id");
    expect(rest).not.toHaveProperty("_creationTime");
    expect(rest.title).toBe("Old sitting");
  });
});

describe("assertSafeToClearLegacyTimeBlockFields", () => {
  it("throws when leftover taskId has no membership", () => {
    const taskId = "jd7task" as Id<"tasks">;
    const blockId = "jd7block" as Id<"timeBlocks">;
    expect(() =>
      assertSafeToClearLegacyTimeBlockFields(
        [{ _id: blockId, userId: "user_test1", taskId }],
        [],
      ),
    ).toThrow(/backfillTimeBlockTasks/);
  });

  it("allows clear when leftover taskId already has a membership", () => {
    const taskId = "jd7task" as Id<"tasks">;
    const blockId = "jd7block" as Id<"timeBlocks">;
    expect(() =>
      assertSafeToClearLegacyTimeBlockFields(
        [{ _id: blockId, userId: "user_test1", taskId }],
        [{ blockId, taskId }],
      ),
    ).not.toThrow();
  });
});

describe("migrations.backfillTimeBlockTasks", () => {
  it("copies taskId and review onto a membership and is idempotent", () => {
    const taskId = "jd7task" as Id<"tasks">;
    const blockId = "jd7block" as Id<"timeBlocks">;
    const payload = membershipFromLegacyBlock({
      _id: blockId,
      userId: "user_test1",
      taskId,
      review: sampleReview,
    });
    expect(payload).toMatchObject({
      userId: "user_test1",
      blockId,
      taskId,
      order: 0,
      review: sampleReview,
    });
    expect(
      membershipFromLegacyBlock({
        _id: blockId,
        userId: "user_test1",
      }),
    ).toBeNull();
  });

  it("does not duplicate an existing membership when re-run", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Legacy",
        order: 0,
      }),
    );
    const blockId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Old sitting",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: id,
        taskId,
        order: 0,
        review: {
          outcome: "partial",
          actualMinutes: 20,
          reviewedAt: Date.now(),
        },
      });
      return id;
    });

    await t.mutation(internal.migrations.backfillTimeBlockTasks, {});
    await t.mutation(internal.migrations.backfillTimeBlockTasks, {});

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].taskId).toBe(taskId);
    expect(rows[0].review?.outcome).toBe("partial");
  });

  it("creates zero rows for personal blocks without taskId", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const blockId = await t.run(async (ctx) =>
      ctx.db.insert("timeBlocks", {
        userId,
        title: "Personal",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      }),
    );

    await t.mutation(internal.migrations.backfillTimeBlockTasks, {});

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("migrations.clearLegacyTimeBlockTaskFields", () => {
  it("replaces a block after omitting leftover taskId and review keys", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Legacy",
        order: 0,
      }),
    );

    const blockId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Old sitting",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      const stored = await ctx.db.get("timeBlocks", id);
      if (!stored) throw new Error("missing block");
      const withLegacy = {
        ...stored,
        taskId,
        review: sampleReview,
      };
      const rest = omitLegacyTimeBlockFields(withLegacy);
      expect(rest).not.toHaveProperty("taskId");
      expect(rest).not.toHaveProperty("review");
      await ctx.db.replace("timeBlocks", id, rest);
      return id;
    });

    await t.mutation(internal.migrations.clearLegacyTimeBlockTaskFields, {});

    const block = await t.run(async (ctx) => ctx.db.get("timeBlocks", blockId));
    expect(block).not.toBeNull();
    expect((block as LegacyTimeBlockFields).taskId).toBeUndefined();
    expect((block as LegacyTimeBlockFields).review).toBeUndefined();
  });

  it("removes taskId and review from timeBlocks after backfill", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Legacy",
        order: 0,
      }),
    );
    const blockId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Old sitting",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId: id,
        taskId,
        order: 0,
        review: {
          outcome: "partial",
          actualMinutes: 20,
          reviewedAt: Date.now(),
        },
      });
      return id;
    });

    await t.mutation(internal.migrations.backfillTimeBlockTasks, {});
    await t.mutation(internal.migrations.clearLegacyTimeBlockTaskFields, {});

    const block = await t.run(async (ctx) => ctx.db.get("timeBlocks", blockId));
    expect(block).not.toBeNull();
    expect((block as LegacyTimeBlockFields).taskId).toBeUndefined();
    expect((block as LegacyTimeBlockFields).review).toBeUndefined();

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("timeBlockTasks")
        .withIndex("by_block", (q) => q.eq("blockId", blockId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].review?.outcome).toBe("partial");
  });
});

describe("backfillBoardColumns", () => {
  it("seeds defaults without creating Investigate or Review columns", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_migrate";
    const asUser = t.withIdentity({ subject: userId });
    await t.run(async (ctx) => {
      for (const title of ["A", "B", "C"]) {
        await ctx.db.insert("tasks", { userId, title, order: 0 });
      }
    });
    await asUser.mutation(api.migrations.backfillBoardColumns, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    expect(columns.map((c) => c.name)).toEqual(["In-Progress", "Test", "Done"]);
    const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
    expect(tasks.every((task) => task.columnId === undefined)).toBe(true);
  });

  it("is a no-op for tasks that already have columnId", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user_migrate2" });
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    const taskId = await asUser.mutation(api.tasks.create, { title: "Parked" });
    await t.run(async (ctx) => {
      await ctx.db.patch("tasks", taskId, { columnId: columns[1]!._id });
    });
    await asUser.mutation(api.migrations.backfillBoardColumns, {});
    expect((await t.run(async (ctx) => ctx.db.get("tasks", taskId)))?.columnId).toBe(
      columns[1]!._id,
    );
  });
});
