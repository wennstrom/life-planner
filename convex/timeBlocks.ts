import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { endOfDayMs, formatDateKey, startOfDayMs } from "./lib/dates";

export const listForDay = query({
  args: { dateKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const dateKey = args.dateKey ?? formatDateKey();
    const start = startOfDayMs(dateKey);
    const end = endOfDayMs(dateKey);

    const blocks = await ctx.db
      .query("timeBlocks")
      .withIndex("by_user_start", (q) => q.eq("userId", userId))
      .collect();

    return blocks
      .filter((block) => block.start < end && block.end > start)
      .sort((a, b) => a.start - b.start);
  },
});

export const listForRange = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const blocks = await ctx.db
      .query("timeBlocks")
      .withIndex("by_user_start", (q) => q.eq("userId", userId))
      .collect();

    return blocks
      .filter((block) => block.start < args.endMs && block.end > args.startMs)
      .sort((a, b) => a.start - b.start);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    start: v.number(),
    end: v.number(),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    if (args.end <= args.start) {
      throw new Error("End must be after start");
    }

    if (args.taskId) {
      const task = await ctx.db.get("tasks", args.taskId);
      if (!task || task.userId !== userId) {
        throw new Error("Task not found");
      }
    }

    const now = Date.now();
    const blockId = await ctx.db.insert("timeBlocks", {
      userId,
      title: args.title,
      start: args.start,
      end: args.end,
      taskId: args.taskId,
      origin: "app",
      syncState: "pending",
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.google.outbound.syncBlock, {
      blockId,
    });

    return blockId;
  },
});

export const update = mutation({
  args: {
    blockId: v.id("timeBlocks"),
    title: v.optional(v.string()),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    taskId: v.optional(v.union(v.id("tasks"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block || block.userId !== userId) {
      throw new Error("Time block not found");
    }

    const start = args.start ?? block.start;
    const end = args.end ?? block.end;
    if (end <= start) {
      throw new Error("End must be after start");
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      syncState: "pending",
    };
    if (args.title !== undefined) patch.title = args.title;
    if (args.start !== undefined) patch.start = args.start;
    if (args.end !== undefined) patch.end = args.end;
    if (args.taskId !== undefined) {
      patch.taskId = args.taskId ?? undefined;
    }

    await ctx.db.patch("timeBlocks", args.blockId, patch);

    if (block.origin === "app") {
      await ctx.scheduler.runAfter(0, internal.google.outbound.syncBlock, {
        blockId: args.blockId,
      });
    }
  },
});

export const remove = mutation({
  args: { blockId: v.id("timeBlocks") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block || block.userId !== userId) {
      throw new Error("Time block not found");
    }

    await ctx.db.patch("timeBlocks", args.blockId, {
      syncState: "pending",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.google.outbound.deleteBlock, {
      blockId: args.blockId,
    });
  },
});

export const createFromTask = mutation({
  args: {
    taskId: v.id("tasks"),
    start: v.number(),
    end: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    const now = Date.now();
    const blockId = await ctx.db.insert("timeBlocks", {
      userId,
      title: task.title,
      start: args.start,
      end: args.end,
      taskId: args.taskId,
      origin: "app",
      syncState: "pending",
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.google.outbound.syncBlock, {
      blockId,
    });

    return blockId;
  },
});

export const markSynced = internalMutation({
  args: {
    blockId: v.id("timeBlocks"),
    googleEventId: v.optional(v.string()),
    syncState: v.union(
      v.literal("synced"),
      v.literal("error"),
      v.literal("pending"),
    ),
  },
  handler: async (ctx, args) => {
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block) {
      return;
    }

    await ctx.db.patch("timeBlocks", args.blockId, {
      googleEventId: args.googleEventId ?? block.googleEventId,
      syncState: args.syncState,
      lastSyncedAt: Date.now(),
    });
  },
});

export const deleteInternal = internalMutation({
  args: { blockId: v.id("timeBlocks") },
  handler: async (ctx, args) => {
    await ctx.db.delete("timeBlocks", args.blockId);
  },
});
