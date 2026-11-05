import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  addBlockerForUser,
  deleteBlockerEdgesForTask,
  listBlockersForTask,
  removeBlockerForUser,
  taskBlockerArgs,
} from "./lib/taskBlockers";

/** Marks `taskId` as blocked by `blockerTaskId`. */
export const add = mutation({
  args: taskBlockerArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await addBlockerForUser(ctx, userId, args);
  },
});

/** Removes the edge. Returns false if there was none. */
export const remove = mutation({
  args: taskBlockerArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await removeBlockerForUser(ctx, userId, args);
  },
});

/** What blocks the task and what it blocks, for the task detail dialog. */
export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await listBlockersForTask(ctx, userId, args.taskId);
  },
});

/** Continue dependency cleanup after the task itself has been deleted. */
export const cleanupDeletedTask = internalMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await deleteBlockerEdgesForTask(ctx, args.taskId);
  },
});
