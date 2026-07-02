import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const list = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    let notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (args.search) {
      const q = args.search.toLowerCase();
      notes = notes.filter(
        (note) =>
          note.title.toLowerCase().includes(q) ||
          note.body.toLowerCase().includes(q),
      );
    }

    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = query({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const note = await ctx.db.get("notes", args.noteId);
    if (!note || note.userId !== userId) {
      throw new Error("Note not found");
    }
    return note;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.userId !== userId) {
        throw new Error("Project not found");
      }
    }

    if (args.taskId) {
      const task = await ctx.db.get("tasks", args.taskId);
      if (!task || task.userId !== userId) {
        throw new Error("Task not found");
      }
    }

    return await ctx.db.insert("notes", {
      userId,
      title: args.title,
      body: args.body ?? "",
      projectId: args.projectId,
      taskId: args.taskId,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    noteId: v.id("notes"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    taskId: v.optional(v.union(v.id("tasks"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const note = await ctx.db.get("notes", args.noteId);
    if (!note || note.userId !== userId) {
      throw new Error("Note not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.body !== undefined) patch.body = args.body;
    if (args.projectId !== undefined) {
      patch.projectId = args.projectId ?? undefined;
    }
    if (args.taskId !== undefined) {
      patch.taskId = args.taskId ?? undefined;
    }

    await ctx.db.patch("notes", args.noteId, patch);
  },
});

export const remove = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const note = await ctx.db.get("notes", args.noteId);
    if (!note || note.userId !== userId) {
      throw new Error("Note not found");
    }
    await ctx.db.delete("notes", args.noteId);
  },
});
