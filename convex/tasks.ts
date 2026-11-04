import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  completedAtForMove,
  getDoneColumn,
  isTaskDone,
  requireOwnedColumn,
} from "./lib/boardColumns";
import {
  createTaskArgs,
  createTaskForUser,
  getOwnedTaskForUser,
  listTasksArgs,
  listTasksForUser,
  updateTaskArgs,
  updateTaskForUser,
} from "./lib/taskOps";
import {
  deleteMembershipsForTask,
  membershipsForBlock,
} from "./lib/timeBlockMemberships";
import { scheduleBlockDelete } from "./lib/blockOps";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

async function destBucketTasks(
  ctx: MutationCtx,
  userId: string,
  columnId: Id<"boardColumns"> | null,
): Promise<Array<Doc<"tasks">>> {
  if (columnId) {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user_columnId", (q) =>
        q.eq("userId", userId).eq("columnId", columnId),
      )
      .collect();
  }
  const all = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return all.filter((task) => task.columnId == null);
}

function sameBucket(
  a: Id<"boardColumns"> | undefined,
  b: Id<"boardColumns"> | null,
): boolean {
  return (a ?? null) === b;
}

async function getOwnedTask(
  ctx: Parameters<typeof requireUserId>[0],
  taskId: Id<"tasks">,
) {
  const userId = await requireUserId(ctx);
  const task = await getOwnedTaskForUser(ctx, userId, taskId);
  return { userId, task };
}

export const list = query({
  args: listTasksArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await listTasksForUser(ctx, userId, args);
  },
});

export const create = mutation({
  args: createTaskArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await createTaskForUser(ctx, userId, args);
  },
});

export const update = mutation({
  args: updateTaskArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await updateTaskForUser(ctx, userId, args);
  },
});

export async function deleteTaskRecord(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
) {
  const blockIds = await deleteMembershipsForTask(ctx, taskId);
  for (const blockId of blockIds) {
    const remaining = await membershipsForBlock(ctx, blockId);
    if (remaining.length === 0) {
      const block = await ctx.db.get("timeBlocks", blockId);
      if (block) await scheduleBlockDelete(ctx, blockId);
    }
  }
  await ctx.db.delete("tasks", taskId);
}

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await getOwnedTask(ctx, args.taskId);
    await deleteTaskRecord(ctx, args.taskId);
  },
});

export const reorder = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    for (let i = 0; i < args.taskIds.length; i++) {
      const task = await ctx.db.get("tasks", args.taskIds[i]);
      if (!task || task.userId !== userId) {
        throw new Error("Task not found");
      }
      await ctx.db.patch("tasks", args.taskIds[i], { order: i });
    }
  },
});

export const moveOnBoard = mutation({
  args: {
    taskId: v.id("tasks"),
    columnId: v.union(v.id("boardColumns"), v.null()),
    beforeTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const { userId, task } = await getOwnedTask(ctx, args.taskId);

    if (args.columnId) {
      await requireOwnedColumn(ctx, userId, args.columnId);
    }

    if (args.beforeTaskId) {
      if (args.beforeTaskId === args.taskId) {
        throw new Error("Invalid drop target");
      }
      const before = await ctx.db.get("tasks", args.beforeTaskId);
      if (!before || before.userId !== userId) {
        throw new Error("Task not found");
      }
      if (!sameBucket(before.columnId, args.columnId)) {
        throw new Error("Invalid drop target");
      }
    }

    const done = await getDoneColumn(ctx, userId);
    const wasDone = isTaskDone(task.columnId, done?._id);
    const willBeDone = isTaskDone(args.columnId ?? undefined, done?._id);
    await ctx.db.patch("tasks", args.taskId, {
      columnId: args.columnId ?? undefined,
      completedAt: completedAtForMove(wasDone, willBeDone, task.completedAt),
    });

    const dest = (await destBucketTasks(ctx, userId, args.columnId)).sort(
      (a, b) => a.order - b.order || a._id.localeCompare(b._id),
    );

    const withoutMoved = dest.filter((row) => row._id !== args.taskId);
    const insertAt = args.beforeTaskId
      ? withoutMoved.findIndex((row) => row._id === args.beforeTaskId)
      : withoutMoved.length;
    if (args.beforeTaskId && insertAt === -1) {
      throw new Error("Invalid drop target");
    }
    const moved = dest.find((row) => row._id === args.taskId);
    if (!moved) {
      throw new Error("Task not found");
    }
    const next = [
      ...withoutMoved.slice(0, insertAt),
      moved,
      ...withoutMoved.slice(insertAt),
    ];

    for (let i = 0; i < next.length; i++) {
      if (next[i].order !== i) {
        await ctx.db.patch("tasks", next[i]._id, { order: i });
      }
    }
  },
});
