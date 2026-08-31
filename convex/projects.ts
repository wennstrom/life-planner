import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { scheduleBlockDelete } from "./timeBlocks";
import {
  deleteMembershipsForTask,
  membershipsForBlock,
} from "./lib/timeBlockMemberships";

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const status = args.status ?? "active";

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", status),
      )
      .collect();

    return projects.sort((a, b) => a.order - b.order);
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return {
      project,
      tasks: tasks.sort((a, b) => a.order - b.order),
      notes: notes.sort((a, b) => b.updatedAt - a.updatedAt),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .collect();

    return await ctx.db.insert("projects", {
      userId,
      name: args.name,
      description: args.description,
      color: args.color,
      status: "active",
      order: existing.length,
    });
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }

    const { projectId, ...patch } = args;
    await ctx.db.patch("projects", projectId, patch);
  },
});

export const remove = mutation({
  args: {
    projectId: v.id("projects"),
    deleteTasks: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    if (args.deleteTasks) {
      for (const task of tasks) {
        const blockIds = await deleteMembershipsForTask(ctx, task._id);
        for (const blockId of blockIds) {
          const remaining = await membershipsForBlock(ctx, blockId);
          if (remaining.length === 0) {
            const block = await ctx.db.get("timeBlocks", blockId);
            if (block) await scheduleBlockDelete(ctx, blockId);
          }
        }
        await ctx.db.delete("tasks", task._id);
      }
    } else {
      for (const task of tasks) {
        await ctx.db.patch("tasks", task._id, { projectId: undefined });
      }
    }

    await ctx.db.delete("projects", args.projectId);
  },
});

export const reorder = mutation({
  args: {
    projectIds: v.array(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    for (let i = 0; i < args.projectIds.length; i++) {
      const project = await ctx.db.get("projects", args.projectIds[i]);
      if (!project || project.userId !== userId) {
        throw new Error("Project not found");
      }
      await ctx.db.patch("projects", args.projectIds[i], { order: i });
    }
  },
});
