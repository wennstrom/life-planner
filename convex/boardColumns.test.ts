import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

async function authed() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("boardColumns.ensureDefaults", () => {
  it("inserts In-Progress, Test, Done once", async () => {
    const { asUser } = await authed();
    expect(await asUser.query(api.boardColumns.list, {})).toEqual([]);
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    expect(
      columns.map((c) => ({ name: c.name, isDone: c.isDone, color: c.color })),
    ).toEqual([
      { name: "In-Progress", isDone: false, color: "#3b82f6" },
      { name: "Test", isDone: false, color: "#eab308" },
      { name: "Done", isDone: true, color: "#22c55e" },
    ]);
    expect(columns[2]!.order).toBeGreaterThan(columns[1]!.order);
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    expect((await asUser.query(api.boardColumns.list, {})).length).toBe(3);
  });
});

describe("boardColumns.save", () => {
  it("renames a workflow column and changes colors without rewriting ids", async () => {
    const { asUser } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const before = await asUser.query(api.boardColumns.list, {});
    await asUser.mutation(api.boardColumns.save, {
      columns: [
        { id: before[0]!._id, name: "Doing", color: "#14b8a6" },
        { id: before[1]!._id, name: "Test", color: "#eab308" },
        { id: before[2]!._id, name: "Done", color: "#22c55e" },
      ],
    });
    const after = await asUser.query(api.boardColumns.list, {});
    expect(after[0]!._id).toBe(before[0]!._id);
    expect(after[0]!.name).toBe("Doing");
    expect(after[0]!.color).toBe("#14b8a6");
  });

  it("appends a new column immediately before Done", async () => {
    const { asUser } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const before = await asUser.query(api.boardColumns.list, {});
    await asUser.mutation(api.boardColumns.save, {
      columns: [
        { id: before[0]!._id, name: "In-Progress", color: "#3b82f6" },
        { id: before[1]!._id, name: "Test", color: "#eab308" },
        { name: "Review", color: "#a855f7" },
        { id: before[2]!._id, name: "Done", color: "#22c55e" },
      ],
    });
    const after = await asUser.query(api.boardColumns.list, {});
    expect(after.map((c) => c.name)).toEqual([
      "In-Progress",
      "Test",
      "Review",
      "Done",
    ]);
    expect(after[3]!.isDone).toBe(true);
  });

  it("rejects Done rename, palette miss, duplicates, and omitting a column", async () => {
    const { asUser } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const cols = await asUser.query(api.boardColumns.list, {});
    const done = cols[2]!;
    const workflow = cols.slice(0, 2).map((c) => ({
      id: c._id,
      name: c.name,
      color: c.color,
    }));
    await expect(
      asUser.mutation(api.boardColumns.save, {
        columns: [
          ...workflow,
          { id: done._id, name: "Finished", color: done.color },
        ],
      }),
    ).rejects.toThrow("Done cannot be renamed");
    await expect(
      asUser.mutation(api.boardColumns.save, {
        columns: [
          ...workflow,
          { id: done._id, name: "Done", color: "#ffffff" },
        ],
      }),
    ).rejects.toThrow("Invalid column color");
    await expect(
      asUser.mutation(api.boardColumns.save, {
        columns: [
          { id: cols[0]!._id, name: "Test", color: cols[0]!.color },
          { id: cols[1]!._id, name: "Test", color: cols[1]!.color },
          { id: done._id, name: "Done", color: done.color },
        ],
      }),
    ).rejects.toThrow("Column name already exists");
    await expect(
      asUser.mutation(api.boardColumns.save, {
        columns: [
          { id: cols[0]!._id, name: cols[0]!.name, color: cols[0]!.color },
          { id: done._id, name: "Done", color: done.color },
        ],
      }),
    ).rejects.toThrow("Use remove to delete a column");
  });
});

describe("boardColumns.remove", () => {
  it("rejects removing Done and removing the last workflow column", async () => {
    const { asUser } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const cols = await asUser.query(api.boardColumns.list, {});
    await expect(
      asUser.mutation(api.boardColumns.remove, { columnId: cols[2]!._id }),
    ).rejects.toThrow("Done cannot be removed");
    await asUser.mutation(api.boardColumns.remove, { columnId: cols[1]!._id });
    await expect(
      asUser.mutation(api.boardColumns.remove, { columnId: cols[0]!._id }),
    ).rejects.toThrow("Cannot remove the last workflow column");
  });

  it("requires disposition when the column still has tasks", async () => {
    const { t, asUser, userId } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const cols = await asUser.query(api.boardColumns.list, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", {
        userId,
        title: "Held",
        columnId: cols[0]!._id,
        order: 0,
      });
    });
    await expect(
      asUser.mutation(api.boardColumns.remove, { columnId: cols[0]!._id }),
    ).rejects.toThrow("Disposition required");
  });

  it("move-to-backlog clears columnId; delete-tasks deletes only that column's tasks", async () => {
    const { t, asUser, userId } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const seeded = await asUser.query(api.boardColumns.list, {});
    await asUser.mutation(api.boardColumns.save, {
      columns: [
        { id: seeded[0]!._id, name: seeded[0]!.name, color: seeded[0]!.color },
        { id: seeded[1]!._id, name: seeded[1]!.name, color: seeded[1]!.color },
        { name: "Review", color: "#a855f7" },
        { id: seeded[2]!._id, name: "Done", color: seeded[2]!.color },
      ],
    });
    const cols = await asUser.query(api.boardColumns.list, {});
    const [keepId, dropId] = await t.run(async (ctx) => {
      const keepId = await ctx.db.insert("tasks", {
        userId,
        title: "Keep",
        columnId: cols[1]!._id,
        order: 0,
      });
      const dropId = await ctx.db.insert("tasks", {
        userId,
        title: "Drop",
        columnId: cols[0]!._id,
        order: 0,
      });
      return [keepId, dropId] as const;
    });
    await asUser.mutation(api.boardColumns.remove, {
      columnId: cols[0]!._id,
      disposition: "move-to-backlog",
    });
    expect(
      (await t.run(async (ctx) => ctx.db.get("tasks", dropId)))?.columnId,
    ).toBeUndefined();
    await asUser.mutation(api.boardColumns.remove, {
      columnId: cols[1]!._id,
      disposition: "delete-tasks",
    });
    expect(await t.run(async (ctx) => ctx.db.get("tasks", keepId))).toBeNull();
    expect(
      await t.run(async (ctx) => ctx.db.get("tasks", dropId)),
    ).not.toBeNull();
  });

  it("does not leak another user's columns", async () => {
    const { t, asUser } = await authed();
    const other = t.withIdentity({ subject: "user_other" });
    await other.mutation(api.boardColumns.ensureDefaults, {});
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const foreign = await other.query(api.boardColumns.list, {});
    const mine = await asUser.query(api.boardColumns.list, {});
    expect(mine.map((c) => c._id)).not.toEqual(foreign.map((c) => c._id));
    await expect(
      asUser.mutation(api.boardColumns.remove, { columnId: foreign[0]!._id }),
    ).rejects.toThrow("Task not found");
  });
});
