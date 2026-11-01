import { DAY_MS } from "./dates";
import type { QueryCtx } from "../_generated/server";

/**
 * How far before a range to look for blocks that started earlier and still
 * overlap it. Long enough for week-long Google events; longer ones only show
 * for their first week.
 */
export const MAX_BLOCK_LOOKBACK_MS = 7 * DAY_MS;

/** The user's blocks overlapping [startMs, endMs), in start order. */
export async function listBlocksOverlapping(
  ctx: QueryCtx,
  userId: string,
  startMs: number,
  endMs: number,
) {
  const blocks = await ctx.db
    .query("timeBlocks")
    .withIndex("by_user_start", (q) =>
      q
        .eq("userId", userId)
        .gte("start", startMs - MAX_BLOCK_LOOKBACK_MS)
        .lt("start", endMs),
    )
    .collect();
  return blocks.filter((block) => block.end > startMs);
}

/** The user's blocks starting within [startMs, endMs), in start order. */
export async function listBlocksStarting(
  ctx: QueryCtx,
  userId: string,
  startMs: number,
  endMs: number,
) {
  return await ctx.db
    .query("timeBlocks")
    .withIndex("by_user_start", (q) =>
      q.eq("userId", userId).gte("start", startMs).lt("start", endMs),
    )
    .collect();
}
