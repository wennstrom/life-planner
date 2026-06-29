import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { formatDateKey } from "./lib/dates";

import type { Id } from "./_generated/dataModel";

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
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return tasks.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    notes: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    scheduledDate: v.optional(v.string()),
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

    const today = formatDateKey();
    const status =
      args.scheduledDate === today
        ? ("today" as const)
        : args.scheduledDate
          ? ("today" as const)
          : ("backlog" as const);

    return await ctx.db.insert("tasks", {
      userId,
      title: args.title,
      notes: args.notes,
      projectId: args.projectId,
      status,
      scheduledDate: args.scheduledDate,
      order: existing.length,
    });
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    priority: v.optional(v.number()),
    dueDate: v.optional(v.string()),
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
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.projectId !== undefined) {
      patch.projectId = args.projectId ?? undefined;
    }

    await ctx.db.patch("tasks", args.taskId, patch);
  },
});

export const complete = mutation({
  args: {
    taskId: v.id("tasks"),
    done: v.boolean(),
  },
  handler: async (ctx, args) => {
    await getOwnedTask(ctx, args.taskId);
    await ctx.db.patch("tasks", args.taskId, {
      status: args.done ? "done" : "backlog",
      completedAt: args.done ? Date.now() : undefined,
      ...(args.done ? { scheduledDate: undefined } : {}),
    });
  },
});

export const sendToToday = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await getOwnedTask(ctx, args.taskId);
    const today = formatDateKey();
    await ctx.db.patch("tasks", args.taskId, {
      scheduledDate: today,
      status: "today",
    });
  },
});

export const removeFromToday = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await getOwnedTask(ctx, args.taskId);
    await ctx.db.patch("tasks", args.taskId, {
      scheduledDate: undefined,
      status: "backlog",
    });
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await getOwnedTask(ctx, args.taskId);
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
