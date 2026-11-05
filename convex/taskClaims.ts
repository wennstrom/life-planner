import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  activeClaimForTask,
  claimView,
  cleanupExpiredForUser,
  forceReleaseForUser,
} from "./lib/taskClaims";
import { getOwnedTaskForUser } from "./lib/taskOps";

export const get = query({
  args: { taskId: v.id("tasks"), now: v.number() },
  handler: async (ctx, { taskId, now }) => {
    const userId = await requireUserId(ctx);
    await getOwnedTaskForUser(ctx, userId, taskId);
    return claimView(await activeClaimForTask(ctx, taskId, now));
  },
});

export const forceRelease = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    await forceReleaseForUser(ctx, await requireUserId(ctx), taskId);
    return null;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => await cleanupExpiredForUser(ctx, Date.now()),
});
