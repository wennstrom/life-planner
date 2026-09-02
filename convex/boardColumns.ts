import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  assertUniqueNames,
  assertValidColor,
  listColumnsForUser,
  normalizeColumnName,
  requireOwnedColumn,
  seedDefaultColumns,
} from "./lib/boardColumns";
import { deleteTaskRecord } from "./tasks";

const saveColumn = v.object({
  id: v.optional(v.id("boardColumns")),
  name: v.string(),
  color: v.string(),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await listColumnsForUser(ctx, userId);
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await seedDefaultColumns(ctx, userId);
    return null;
  },
});

export const save = mutation({
  args: { columns: v.array(saveColumn) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await listColumnsForUser(ctx, userId);
    if (existing.length === 0) {
      throw new Error("Board must have between 2 and 8 columns");
    }
    if (args.columns.length < 2 || args.columns.length > 8) {
      throw new Error("Board must have between 2 and 8 columns");
    }
    const done = existing.find((c) => c.isDone);
    if (!done) throw new Error("Done must stay last");
    const last = args.columns[args.columns.length - 1];
    if (last.id !== done._id) {
      throw new Error("Done must stay last");
    }
    const lastName = normalizeColumnName(last.name);
    if (lastName !== "Done") throw new Error("Done cannot be renamed");
    assertValidColor(last.color);

    const existingIds = new Set(
      existing.filter((c) => !c.isDone).map((c) => c._id),
    );
    const seenIds = new Set<string>();
    const names: Array<string> = [];
    for (const row of args.columns) {
      const name = normalizeColumnName(row.name);
      if (!name) throw new Error("Column name is required");
      names.push(name);
      assertValidColor(row.color);
      if (row.id) {
        const col = await requireOwnedColumn(ctx, userId, row.id);
        seenIds.add(row.id);
        if (col.isDone && row !== last) throw new Error("Done must stay last");
      }
    }
    assertUniqueNames(names);
    for (const id of existingIds) {
      if (!seenIds.has(id)) {
        throw new Error("Use remove to delete a column");
      }
    }

    for (const [i, row] of args.columns.entries()) {
      const name = normalizeColumnName(row.name);
      if (row.id) {
        await ctx.db.patch("boardColumns", row.id, {
          name,
          color: row.color,
          order: i,
        });
      } else {
        await ctx.db.insert("boardColumns", {
          userId,
          name,
          color: row.color,
          order: i,
          isDone: false,
        });
      }
    }
    return null;
  },
});

export const remove = mutation({
  args: {
    columnId: v.id("boardColumns"),
    disposition: v.optional(
      v.union(v.literal("delete-tasks"), v.literal("move-to-backlog")),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const column = await requireOwnedColumn(ctx, userId, args.columnId);
    if (column.isDone) throw new Error("Done cannot be removed");
    const existing = await listColumnsForUser(ctx, userId);
    if (existing.length - 1 < 2) {
      throw new Error("Cannot remove the last workflow column");
    }
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_columnId", (q) =>
        q.eq("userId", userId).eq("columnId", args.columnId),
      )
      .collect();
    if (tasks.length > 0) {
      if (
        args.disposition !== "delete-tasks" &&
        args.disposition !== "move-to-backlog"
      ) {
        throw new Error("Disposition required");
      }
      if (args.disposition === "delete-tasks") {
        for (const task of tasks) {
          await deleteTaskRecord(ctx, task._id);
        }
      } else {
        for (const task of tasks) {
          await ctx.db.patch("tasks", task._id, { columnId: undefined });
        }
      }
    }
    await ctx.db.delete("boardColumns", args.columnId);
    const remaining = (await listColumnsForUser(ctx, userId)).filter(
      (c) => c._id !== args.columnId,
    );
    remaining.sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
    for (const [i, col] of remaining.entries()) {
      if (col.order !== i) {
        await ctx.db.patch("boardColumns", col._id, { order: i });
      }
    }
    return null;
  },
});
