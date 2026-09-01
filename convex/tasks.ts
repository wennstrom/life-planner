import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  checklistItemValidator,
  isTaskArchived,
  normalizeChecklist,
} from "./lib/checklist";
import {
  deleteMembershipsForTask,
  membershipsForBlock,
} from "./lib/timeBlockMemberships";
import { scheduleBlockDelete } from "./timeBlocks";

import type { Id } from "./_generated/dataModel";

const taskStatus = v.union(
  v.literal("backlog"),
  v.literal("in-progress"),
  v.literal("review"),
  v.literal("test"),
  v.literal("investigate"),
  v.literal("done"),
);

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
    status: v.optional(taskStatus),
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

    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const status = args.status ?? "backlog";
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
      status,
      estimateMinutes: args.estimateMinutes,
      dueDate: args.dueDate,
      priority: args.priority,
      order: existing.length,
      completedAt: status === "done" ? Date.now() : undefined,
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
    status: v.optional(taskStatus),
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
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.completedAt = args.status === "done" ? Date.now() : undefined;
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

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await getOwnedTask(ctx, args.taskId);
    const blockIds = await deleteMembershipsForTask(ctx, args.taskId);
    for (const blockId of blockIds) {
      const remaining = await membershipsForBlock(ctx, blockId);
      if (remaining.length === 0) {
        const block = await ctx.db.get("timeBlocks", blockId);
        if (block) await scheduleBlockDelete(ctx, blockId);
      }
    }
    await ctx.db.delete("tasks", args.taskId);
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
