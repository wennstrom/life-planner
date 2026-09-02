import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  checklistItemValidator,
  isTaskArchived,
  normalizeChecklist,
} from "./lib/checklist";
import {
  completedAtForMove,
  getDoneColumn,
  isTaskDone,
  requireOwnedColumn,
} from "./lib/boardColumns";
import {
  deleteMembershipsForTask,
  membershipsForBlock,
} from "./lib/timeBlockMemberships";
import { scheduleBlockDelete } from "./timeBlocks";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const columnIdArg = v.optional(v.union(v.id("boardColumns"), v.null()));

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
  const task = await ctx.db.get("tasks", taskId);
  if (!task || task.userId !== userId) {
    throw new Error("Task not found");
  }
  return { userId, task };
}

export const list = query({
  args: {
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const archived = args.archived ?? false;
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return tasks
      .filter((task) => isTaskArchived(task) === archived)
      .sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    notes: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    dueDate: v.optional(v.string()),
    estimateMinutes: v.optional(v.number()),
    columnId: columnIdArg,
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    checklist: v.optional(v.array(checklistItemValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.userId !== userId) {
        throw new Error("Project not found");
      }
    }

    const columnId = args.columnId ?? undefined;
    if (columnId) {
      await requireOwnedColumn(ctx, userId, columnId);
    }

    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const done = await getDoneColumn(ctx, userId);
    const checklist =
      args.checklist !== undefined
        ? normalizeChecklist(args.checklist)
        : undefined;
    return await ctx.db.insert("tasks", {
      userId,
      title: args.title,
      notes: args.notes,
      checklist,
      archived: false,
      projectId: args.projectId,
      columnId,
      estimateMinutes: args.estimateMinutes,
      dueDate: args.dueDate,
      priority: args.priority,
      order: existing.length,
      completedAt: isTaskDone(columnId, done?._id)
        ? Date.now()
        : undefined,
    });
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    priority: v.optional(
      v.union(v.literal(1), v.literal(2), v.literal(3), v.null()),
    ),
    dueDate: v.optional(v.union(v.string(), v.null())),
    estimateMinutes: v.optional(v.union(v.number(), v.null())),
    columnId: columnIdArg,
    checklist: v.optional(v.array(checklistItemValidator)),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { task } = await getOwnedTask(ctx, args.taskId);

    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.userId !== task.userId) {
        throw new Error("Project not found");
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.notes !== undefined) patch.notes = args.notes ?? undefined;
    if (args.priority !== undefined) patch.priority = args.priority ?? undefined;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;
    if (args.estimateMinutes !== undefined) {
      patch.estimateMinutes = args.estimateMinutes ?? undefined;
    }
    if (args.projectId !== undefined) {
      patch.projectId = args.projectId ?? undefined;
    }
    if (args.columnId !== undefined) {
      const userId = task.userId;
      if (args.columnId) {
        await requireOwnedColumn(ctx, userId, args.columnId);
      }
      const done = await getDoneColumn(ctx, userId);
      const wasDone = isTaskDone(task.columnId, done?._id);
      const willBeDone = isTaskDone(args.columnId ?? undefined, done?._id);
      patch.columnId = args.columnId ?? undefined;
      patch.completedAt = completedAtForMove(
        wasDone,
        willBeDone,
        task.completedAt,
      );
    }
    if (args.checklist !== undefined) {
      const checklist = normalizeChecklist(args.checklist);
      patch.checklist = checklist.length > 0 ? checklist : undefined;
    }
    if (args.archived !== undefined) {
      patch.archived = args.archived ? true : undefined;
    }

    await ctx.db.patch("tasks", args.taskId, patch);
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
