import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  deleteMembershipsForBlock,
  replaceMemberships,
} from "./lib/timeBlockMemberships";
import {
  endOfDayMs,
  formatDateKey,
  sameClockTimeNextDay,
  startOfDayMs,
} from "./lib/dates";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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

export const listNeedingReview = query({
  args: { dateKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const dateKey = args.dateKey ?? formatDateKey();
    const start = startOfDayMs(dateKey);
    const end = endOfDayMs(dateKey);
    const now = Date.now();

    const blocks = await ctx.db
      .query("timeBlocks")
      .withIndex("by_user_start", (q) => q.eq("userId", userId))
      .collect();

    return blocks
      .filter(
        (b) =>
          b.origin === "app" &&
          b.taskId != null &&
          b.end <= now &&
          b.review === undefined &&
          b.start >= start &&
          b.start <= end,
      )
      .sort((a, b) => a.start - b.start);
  },
});

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    const blocks = await ctx.db
      .query("timeBlocks")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return blocks.sort((a, b) => b.start - a.start);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    start: v.number(),
    end: v.number(),
    taskIds: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    if (args.end <= args.start) {
      throw new Error("End must be after start");
    }

    const now = Date.now();
    const blockId = await ctx.db.insert("timeBlocks", {
      userId,
      title: args.title,
      start: args.start,
      end: args.end,
      origin: "app",
      syncState: "pending",
      updatedAt: now,
    });

    if (args.taskIds?.length) {
      await replaceMemberships(ctx, {
        userId,
        blockId,
        taskIds: args.taskIds,
      });
    }

    await ctx.scheduler.runAfter(0, internal.google.outbound.syncBlock, {
      blockId,
    });

    return blockId;
  },
});

export const review = mutation({
  args: {
    blockId: v.id("timeBlocks"),
    outcome: v.union(
      v.literal("done"),
      v.literal("partial"),
      v.literal("missed"),
    ),
    actualMinutes: v.number(),
    focus: v.optional(
      v.union(
        v.literal("deep"),
        v.literal("shallow"),
        v.literal("interrupted"),
      ),
    ),
    note: v.optional(v.string()),
    nextStep: v.optional(v.string()),
    blockedReason: v.optional(v.string()),
    taskDone: v.optional(v.boolean()),
    scheduleNext: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block || block.userId !== userId) {
      throw new Error("Time block not found");
    }

    await ctx.db.patch("timeBlocks", args.blockId, {
      review: {
        outcome: args.outcome,
        actualMinutes: args.actualMinutes,
        focus: args.focus,
        note: args.note,
        nextStep: args.nextStep,
        blockedReason: args.blockedReason,
        reviewedAt: Date.now(),
      },
    });

    if (args.taskDone && block.taskId) {
      await ctx.db.patch("tasks", block.taskId, {
        status: "done",
        completedAt: Date.now(),
      });
    }

    if (args.scheduleNext && block.taskId && args.nextStep?.trim()) {
      const duration = block.end - block.start;
      const nextStart = sameClockTimeNextDay(block.start);
      const followUpId = await ctx.db.insert("timeBlocks", {
        userId,
        title: args.nextStep.trim(),
        start: nextStart,
        end: nextStart + duration,
        taskId: block.taskId,
        origin: "app",
        syncState: "pending",
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.google.outbound.syncBlock, {
        blockId: followUpId,
      });
    }
  },
});

export async function scheduleBlockDelete(
  ctx: MutationCtx,
  blockId: Id<"timeBlocks">,
) {
  await ctx.db.patch("timeBlocks", blockId, {
    syncState: "pending",
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.google.outbound.deleteBlock, {
    blockId,
  });
}

export const update = mutation({
  args: {
    blockId: v.id("timeBlocks"),
    title: v.optional(v.string()),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    taskIds: v.optional(v.array(v.id("tasks"))),
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

    await ctx.db.patch("timeBlocks", args.blockId, patch);

    if (args.taskIds !== undefined) {
      await replaceMemberships(ctx, {
        userId,
        blockId: args.blockId,
        taskIds: args.taskIds,
      });
    }

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

    await scheduleBlockDelete(ctx, args.blockId);
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
      origin: "app",
      syncState: "pending",
      updatedAt: now,
    });

    await replaceMemberships(ctx, {
      userId,
      blockId,
      taskIds: [args.taskId],
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
    await deleteMembershipsForBlock(ctx, args.blockId);
    await ctx.db.delete("timeBlocks", args.blockId);
  },
});
