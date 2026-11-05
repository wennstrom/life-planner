import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  deleteTaskWorkForUser,
  handoffHistoryForUser,
} from "./lib/taskHandoffs";

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) =>
    await handoffHistoryForUser(ctx, await requireUserId(ctx), taskId),
});
export const cleanupDeletedTask = internalMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => await deleteTaskWorkForUser(ctx, taskId),
});
