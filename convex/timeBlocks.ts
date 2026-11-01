import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  attachBlockViews,
  deleteMembershipsForBlock,
  replaceMemberships,
} from "./lib/timeBlockMemberships";
import { getDoneColumn, seedDefaultColumns } from "./lib/boardColumns";
import {
  assertValidDayWindow,
  assertValidRange,
  dayWindowArgs,
} from "./lib/dates";
import {
  listBlocksOverlapping,
  listBlocksStarting,
} from "./lib/timeBlockQueries";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const listForDay = query({
  args: dayWindowArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    assertValidDayWindow(args);
    const blocks = await listBlocksOverlapping(
      ctx,
      userId,
      args.dayStartMs,
      args.dayEndMs,
    );
    return attachBlockViews(ctx, blocks);
  },
});

export const listForRange = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    assertValidRange(args.startMs, args.endMs);
    const blocks = await listBlocksOverlapping(
      ctx,
      userId,
      args.startMs,
      args.endMs,
    );
    return attachBlockViews(ctx, blocks);
  },
});

export const listNeedingReview = query({
  args: {
    ...dayWindowArgs,
    // Client clock rounded to the minute. Queries can't read the wall clock
    // without going stale, so the client advances this to re-run the query.
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    assertValidDayWindow(args);
    const blocks = await listBlocksStarting(
      ctx,
      userId,
      args.dayStartMs,
      args.dayEndMs,
    );

    const candidates = blocks.filter(
      (b) => b.origin === "app" && b.end <= args.nowMs,
    );
    const views = await attachBlockViews(ctx, candidates);
    return views.filter(
      (b) =>
        b.memberships.length > 0 &&
        b.memberships.some((m) => m.review === undefined),
    );
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

    const rows = await ctx.db
      .query("timeBlockTasks")
      .withIndex("by_user_task", (q) =>
        q.eq("userId", userId).eq("taskId", args.taskId),
      )
      .collect();

    const seen = new Set<string>();
    const blocks = [];
    for (const row of rows) {
      if (seen.has(row.blockId)) continue;
      seen.add(row.blockId);
      const block = await ctx.db.get("timeBlocks", row.blockId);
      if (block) blocks.push(block);
    }

    const views = await attachBlockViews(ctx, blocks);
    return views.sort((a, b) => b.start - a.start);
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
    timeBlockTaskId: v.id("timeBlockTasks"),
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
    // Start of the follow-up block: the same local clock time tomorrow, which
    // only the client can work out across DST changes.
    nextStart: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const membership = await ctx.db.get("timeBlockTasks", args.timeBlockTaskId);
    if (!membership || membership.userId !== userId) {
      throw new Error("Time block not found");
    }
    const block = await ctx.db.get("timeBlocks", membership.blockId);
    if (!block || block.userId !== userId || block.origin !== "app") {
      throw new Error("Time block not found");
    }

    await ctx.db.patch("timeBlockTasks", args.timeBlockTaskId, {
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

    if (args.taskDone) {
      await seedDefaultColumns(ctx, userId);
      const done = await getDoneColumn(ctx, userId);
      if (done) {
        await ctx.db.patch("tasks", membership.taskId, {
          columnId: done._id,
          completedAt: Date.now(),
        });
      }
    }

    const nextStep = args.nextStep?.trim();
    if (args.scheduleNext && nextStep) {
      if (args.nextStart === undefined) {
        throw new Error("Choose when to schedule the next step");
      }
      const duration = block.end - block.start;
      const nextStart = args.nextStart;
      const followUpId = await ctx.db.insert("timeBlocks", {
        userId,
        title: nextStep,
        start: nextStart,
        end: nextStart + duration,
        origin: "app",
        syncState: "pending",
        updatedAt: Date.now(),
      });
      await replaceMemberships(ctx, {
        userId,
        blockId: followUpId,
        taskIds: [membership.taskId],
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
    if (task.archived === true) {
      throw new Error("Cannot plan an archived task");
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
