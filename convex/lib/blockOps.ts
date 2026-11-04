import { v } from "convex/values";
import { internal } from "../_generated/api";
import { assertValidRange } from "./dates";
import { getOwnedTaskForUser } from "./taskOps";
import { listBlocksOverlapping } from "./timeBlockQueries";
import { attachBlockViews, replaceMemberships } from "./timeBlockMemberships";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { TimeBlockView } from "./timeBlockMemberships";

// Calendar block business rules shared by the public functions (Clerk auth)
// and the MCP tools (token auth). Callers resolve `userId` themselves.

export const listBlocksArgs = v.object({
  startMs: v.number(),
  endMs: v.number(),
});

export const createBlockArgs = v.object({
  title: v.string(),
  start: v.number(),
  end: v.number(),
  taskIds: v.optional(v.array(v.id("tasks"))),
});

export const updateBlockArgs = v.object({
  blockId: v.id("timeBlocks"),
  title: v.optional(v.string()),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
  taskIds: v.optional(v.array(v.id("tasks"))),
});

export const removeBlockArgs = v.object({ blockId: v.id("timeBlocks") });

export const createBlockFromTaskArgs = v.object({
  taskId: v.id("tasks"),
  start: v.number(),
  end: v.number(),
});

/** The block, if it exists and belongs to `userId`; otherwise throws. */
export async function getOwnedBlockForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  blockId: Id<"timeBlocks">,
): Promise<Doc<"timeBlocks">> {
  const block = await ctx.db.get("timeBlocks", blockId);
  if (!block || block.userId !== userId) {
    throw new Error("Time block not found");
  }
  return block;
}

/** Blocks overlapping [startMs, endMs), with their task memberships. */
export async function listBlocksForUser(
  ctx: QueryCtx,
  userId: string,
  args: Infer<typeof listBlocksArgs>,
): Promise<Array<TimeBlockView>> {
  assertValidRange(args.startMs, args.endMs);
  const blocks = await listBlocksOverlapping(
    ctx,
    userId,
    args.startMs,
    args.endMs,
  );
  return attachBlockViews(ctx, blocks);
}

/** Blocks a task is planned in, newest first. */
export async function listBlocksForTaskForUser(
  ctx: QueryCtx,
  userId: string,
  taskId: Id<"tasks">,
): Promise<Array<TimeBlockView>> {
  await getOwnedTaskForUser(ctx, userId, taskId);

  const rows = await ctx.db
    .query("timeBlockTasks")
    .withIndex("by_user_task", (q) =>
      q.eq("userId", userId).eq("taskId", taskId),
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
}

export async function createBlockForUser(
  ctx: MutationCtx,
  userId: string,
  args: Infer<typeof createBlockArgs>,
): Promise<Id<"timeBlocks">> {
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
}

export async function updateBlockForUser(
  ctx: MutationCtx,
  userId: string,
  args: Infer<typeof updateBlockArgs>,
): Promise<void> {
  const block = await getOwnedBlockForUser(ctx, userId, args.blockId);

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
}

/**
 * Marks a block for deletion and schedules the Google delete, which removes
 * the block and its memberships once the event is gone.
 */
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

export async function removeBlockForUser(
  ctx: MutationCtx,
  userId: string,
  args: Infer<typeof removeBlockArgs>,
): Promise<void> {
  await getOwnedBlockForUser(ctx, userId, args.blockId);
  await scheduleBlockDelete(ctx, args.blockId);
}

/** A new app block titled after the task, with the task as its only member. */
export async function createBlockFromTaskForUser(
  ctx: MutationCtx,
  userId: string,
  args: Infer<typeof createBlockFromTaskArgs>,
): Promise<Id<"timeBlocks">> {
  const task = await getOwnedTaskForUser(ctx, userId, args.taskId);
  if (task.archived === true) {
    throw new Error("Cannot plan an archived task");
  }
  if (args.end <= args.start) {
    throw new Error("End must be after start");
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
}
