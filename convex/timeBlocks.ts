import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  attachBlockViews,
  deleteMembershipsForBlock,
  membershipsForBlock,
} from "./lib/timeBlockMemberships";
import {
  createBlockArgs,
  createBlockForUser,
  createBlockFromTaskArgs,
  createBlockFromTaskForUser,
  listBlocksArgs,
  listBlocksForTaskForUser,
  listBlocksForUser,
  removeBlockArgs,
  removeBlockForUser,
  updateBlockArgs,
  updateBlockForUser,
} from "./lib/blockOps";
import {
  MAX_DUPLICATE_STARTS,
  UNREVIEWED_SCAN_CAP,
  blockAwaitsReview,
  insertBlockCopy,
  insertFollowUpBlock,
  reviewInputFields,
  unreviewedWindow,
} from "./lib/blockReview";
import { getDoneColumn, seedDefaultColumns } from "./lib/boardColumns";
import { assertValidDayWindow, dayWindowArgs } from "./lib/dates";
import {
  listBlocksOverlapping,
  listBlocksStarting,
} from "./lib/timeBlockQueries";

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
  args: listBlocksArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await listBlocksForUser(ctx, userId, args);
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
    return views.filter(blockAwaitsReview);
  },
});

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await listBlocksForTaskForUser(ctx, userId, args.taskId);
  },
});

export const create = mutation({
  args: createBlockArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await createBlockForUser(ctx, userId, args);
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
      await insertFollowUpBlock(ctx, {
        userId,
        block,
        start: args.nextStart,
        title: nextStep,
        taskIds: [membership.taskId],
      });
    }
  },
});

/** Reviews a block that has no tasks. Blocks with tasks use `review`. */
export const reviewTaskless = mutation({
  args: {
    blockId: v.id("timeBlocks"),
    ...reviewInputFields,
    scheduleNext: v.optional(v.boolean()),
    // See `review`: the client works out the follow-up's local start.
    nextStart: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block || block.userId !== userId || block.origin !== "app") {
      throw new Error("Time block not found");
    }
    const memberships = await membershipsForBlock(ctx, args.blockId);
    if (memberships.length > 0) {
      throw new Error("Review each task on this block instead");
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

    const nextStep = args.nextStep?.trim();
    if (args.scheduleNext && nextStep) {
      await insertFollowUpBlock(ctx, {
        userId,
        block,
        start: args.nextStart,
        title: nextStep,
        taskIds: [],
      });
    }
  },
});

export const update = mutation({
  args: updateBlockArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await updateBlockForUser(ctx, userId, args);
  },
});

export const remove = mutation({
  args: removeBlockArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await removeBlockForUser(ctx, userId, args);
  },
});

export const createFromTask = mutation({
  args: createBlockFromTaskArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await createBlockFromTaskForUser(ctx, userId, args);
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

/**
 * App blocks from earlier days that still need a review, oldest first.
 * `beforeMs` is the start of the selected local day and `nowMs` the client's
 * clock (rounded to the minute); the query never reads the wall clock.
 * Looks back a fixed number of days so skipped reviews fade out quietly.
 */
export const listUnreviewedBefore = query({
  args: {
    beforeMs: v.number(),
    nowMs: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { fromMs, cutoffMs, limit } = unreviewedWindow(args);

    const blocks = await ctx.db
      .query("timeBlocks")
      .withIndex("by_user_start", (q) =>
        q.eq("userId", userId).gte("start", fromMs).lt("start", cutoffMs),
      )
      .take(UNREVIEWED_SCAN_CAP);

    const unreviewed = [];
    for (const block of blocks) {
      if (block.origin !== "app" || block.end > cutoffMs) continue;
      const [view] = await attachBlockViews(ctx, [block]);
      if (!blockAwaitsReview(view)) continue;
      unreviewed.push(view);
      if (unreviewed.length >= limit) break;
    }
    return unreviewed;
  },
});

/**
 * Independent copies of an app block (title, duration, tasks; no reviews)
 * at the given start times. Not a recurrence rule: each copy is a normal
 * block that syncs to Google on its own. The client computes the local
 * start times, so DST is handled there.
 */
export const duplicate = mutation({
  args: {
    blockId: v.id("timeBlocks"),
    starts: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block || block.userId !== userId || block.origin !== "app") {
      throw new Error("Time block not found");
    }
    const starts = [...new Set(args.starts)];
    if (starts.length > MAX_DUPLICATE_STARTS) {
      throw new Error(`At most ${MAX_DUPLICATE_STARTS} copies at a time`);
    }
    if (starts.some((start) => !Number.isFinite(start))) {
      throw new Error("Invalid start time");
    }

    const taskIds = (await membershipsForBlock(ctx, block._id)).map(
      (membership) => membership.taskId,
    );
    const duration = block.end - block.start;
    const blockIds = [];
    for (const start of starts) {
      blockIds.push(
        await insertBlockCopy(ctx, {
          userId,
          title: block.title,
          start,
          end: start + duration,
          taskIds,
        }),
      );
    }
    return blockIds;
  },
});
