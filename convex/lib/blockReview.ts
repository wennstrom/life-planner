import { internal } from "../_generated/api";
import { blockReview } from "../schema";
import { sameClockTimeNextDay } from "./dates";
import { replaceMemberships } from "./timeBlockMemberships";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Review fields a client sends; the server stamps `reviewedAt`. */
export const reviewInputFields = blockReview.omit("reviewedAt").fields;

type ReviewableBlock = {
  origin: "app" | "google";
  review?: unknown;
  memberships: Array<{ review?: unknown }>;
};

/**
 * App blocks with tasks need a review per task. App blocks without tasks are
 * reviewed once, on the block itself. Ignores time; callers check the end.
 */
export function blockAwaitsReview(block: ReviewableBlock): boolean {
  if (block.origin !== "app") return false;
  if (block.memberships.length === 0) return block.review === undefined;
  return block.memberships.some((m) => m.review === undefined);
}

/** A copy of `block` at the same clock time tomorrow, with the given tasks. */
export async function insertFollowUpBlock(
  ctx: MutationCtx,
  args: {
    userId: string;
    block: Doc<"timeBlocks">;
    title: string;
    taskIds: Id<"tasks">[];
  },
) {
  const duration = args.block.end - args.block.start;
  const nextStart = sameClockTimeNextDay(args.block.start);
  return await insertBlockCopy(ctx, {
    userId: args.userId,
    title: args.title,
    start: nextStart,
    end: nextStart + duration,
    taskIds: args.taskIds,
  });
}

/** Inserts a fresh app block (no reviews) and schedules its Google sync. */
export async function insertBlockCopy(
  ctx: MutationCtx,
  args: {
    userId: string;
    title: string;
    start: number;
    end: number;
    taskIds: Id<"tasks">[];
  },
) {
  const blockId = await ctx.db.insert("timeBlocks", {
    userId: args.userId,
    title: args.title,
    start: args.start,
    end: args.end,
    origin: "app",
    syncState: "pending",
    updatedAt: Date.now(),
  });
  if (args.taskIds.length > 0) {
    await replaceMemberships(ctx, {
      userId: args.userId,
      blockId,
      taskIds: args.taskIds,
    });
  }
  await ctx.scheduler.runAfter(0, internal.google.outbound.syncBlock, {
    blockId,
  });
  return blockId;
}
