import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { endOfDayMs, formatDateKey, startOfDayMs } from "./lib/dates";
import {
  buildTaskStatsMap,
  emptyTaskStats,
  isTaskActive,
} from "./lib/taskStats";
import { attachBlockViews } from "./lib/timeBlockMemberships";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

async function getDayRecord(
  ctx: QueryCtx,
  userId: string,
  dateKey: string,
) {
  return await ctx.db
    .query("dayRecords")
    .withIndex("by_user_dateKey", (q) =>
      q.eq("userId", userId).eq("dateKey", dateKey),
    )
    .unique();
}

async function upsertDayRecord(
  ctx: MutationCtx,
  userId: string,
  dateKey: string,
  patch: Partial<Doc<"dayRecords">>,
) {
  const existing = await ctx.db
    .query("dayRecords")
    .withIndex("by_user_dateKey", (q) =>
      q.eq("userId", userId).eq("dateKey", dateKey),
    )
    .unique();

  if (existing) {
    await ctx.db.patch("dayRecords", existing._id, {
      ...patch,
      updatedAt: Date.now(),
    });
    return existing._id;
  }

  return await ctx.db.insert("dayRecords", {
    userId,
    dateKey,
    intention: patch.intention,
    shutdownCompletedAt: patch.shutdownCompletedAt,
    shutdownNote: patch.shutdownNote,
    updatedAt: Date.now(),
  });
}

export const saveIntention = mutation({
  args: {
    intention: v.string(),
    dateKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const dateKey = args.dateKey ?? formatDateKey();

    return await upsertDayRecord(ctx, userId, dateKey, {
      intention: args.intention,
    });
  },
});

export const completeShutdown = mutation({
  args: {
    note: v.string(),
    dateKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const dateKey = args.dateKey ?? formatDateKey();

    return await upsertDayRecord(ctx, userId, dateKey, {
      shutdownCompletedAt: Date.now(),
      shutdownNote: args.note,
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
    const dayStart = startOfDayMs(dateKey);
    const dayEnd = endOfDayMs(dateKey);

    const blocks = await ctx.db
      .query("timeBlocks")
      .withIndex("by_user_start", (q) => q.eq("userId", userId))
      .collect();

    const todaysBlocks = blocks.filter(
      (b) => b.start < dayEnd && b.end > dayStart,
    );

    const todaysViews = await attachBlockViews(ctx, todaysBlocks);
    const firstStartByTask = new Map<Id<"tasks">, number>();
    for (const block of todaysViews) {
      for (const membership of block.memberships) {
        const prev = firstStartByTask.get(membership.taskId);
        if (prev === undefined || block.start < prev) {
          firstStartByTask.set(membership.taskId, block.start);
        }
      }
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projectMap = new Map(projects.map((p) => [p._id, p]));
    const statsMap = await buildTaskStatsMap(ctx, userId);

    const taskIds = [...firstStartByTask.keys()];
    const tasks = (
      await Promise.all(taskIds.map((id) => ctx.db.get("tasks", id)))
    )
      .filter((t): t is Doc<"tasks"> => t != null)
      .sort(
        (a, b) =>
          (firstStartByTask.get(a._id) ?? 0) -
          (firstStartByTask.get(b._id) ?? 0),
      );

    return {
      dateKey,
      dayRecord: await getDayRecord(ctx, userId, dateKey),
      tasks: tasks.map((task) => ({
        ...task,
        project: task.projectId ? projectMap.get(task.projectId) ?? null : null,
        stats: statsMap.get(task._id) ?? emptyTaskStats(),
        active: isTaskActive(task.status, statsMap.get(task._id)),
      })),
    };
  },
});
