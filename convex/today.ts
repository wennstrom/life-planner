import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { formatDateKey } from "./lib/dates";

const QUICK_NOTE_TITLE = "__today_quick_note__";

export const getQuickNote = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return notes.find((n) => n.title === QUICK_NOTE_TITLE) ?? null;
  },
});

export const saveQuickNote = mutation({
  args: { body: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existing = notes.find((n) => n.title === QUICK_NOTE_TITLE);

    if (existing) {
      await ctx.db.patch("notes", existing._id, {
        body: args.body,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("notes", {
      userId,
      title: QUICK_NOTE_TITLE,
      body: args.body,
      updatedAt: Date.now(),
    });
  },
});

export const get = query({
  args: {
    dateKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const dateKey = args.dateKey ?? formatDateKey();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const todayTasks = tasks
      .filter(
        (task) =>
          task.status !== "done" &&
          (task.scheduledDate === dateKey || task.status === "today"),
      )
      .sort((a, b) => a.order - b.order);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projectMap = new Map(projects.map((p) => [p._id, p]));

    return {
      dateKey,
      tasks: todayTasks.map((task) => ({
        ...task,
        project: task.projectId ? projectMap.get(task.projectId) : null,
      })),
    };
  },
});
