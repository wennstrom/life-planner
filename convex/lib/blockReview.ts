import { internal } from "../_generated/api";
import { blockReview } from "../schema";
import { DAY_MS } from "./dates";
import { replaceMemberships } from "./timeBlockMemberships";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Review fields a client sends; the server stamps `reviewedAt`. */
export const reviewInputFields = blockReview.omit("reviewedAt").fields;

/** How far back `listUnreviewedBefore` looks, so it never scans all history. */
export const UNREVIEWED_LOOKBACK_DAYS = 14;
export const UNREVIEWED_DEFAULT_LIMIT = 50;
export const UNREVIEWED_MAX_LIMIT = 100;
/** Most blocks read from the index range, even on a very busy fortnight. */
export const UNREVIEWED_SCAN_CAP = 500;

/** Copies made by one `timeBlocks.duplicate` call. */
export const MAX_DUPLICATE_STARTS = 60;

/**
 * The window `listUnreviewedBefore` scans: blocks that start in the
 * lookback before the cutoff. The cutoff is the start of the selected day,
 * or now if that is earlier (a future day is selected).
 */
export function unreviewedWindow(args: {
  beforeMs: number;
  nowMs: number;
  limit?: number;
}) {
  const cutoffMs = Math.min(args.beforeMs, args.nowMs);
  const requested = Math.floor(args.limit ?? UNREVIEWED_DEFAULT_LIMIT);
  return {
    fromMs: cutoffMs - UNREVIEWED_LOOKBACK_DAYS * DAY_MS,
    cutoffMs,
    limit: Math.min(Math.max(requested, 1), UNREVIEWED_MAX_LIMIT),
  };
}

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

/**
 * A copy of `block` at `start`, with the given tasks. The client picks
 * `start` (the next same-clock-time slot that is not in the past), since
 * only it knows the user's time zone.
 */
export async function insertFollowUpBlock(
  ctx: MutationCtx,
  args: {
    userId: string;
    block: Doc<"timeBlocks">;
    start: number | undefined;
    title: string;
    taskIds: Array<Id<"tasks">>;
  },
) {
  if (args.start === undefined) {
    throw new Error("Choose when to schedule the next step");
  }
  const duration = args.block.end - args.block.start;
  return await insertBlockCopy(ctx, {
    userId: args.userId,
    title: args.title,
    start: args.start,
    end: args.start + duration,
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
    taskIds: Array<Id<"tasks">>;
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
