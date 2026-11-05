import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  addBlockerForUser,
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
