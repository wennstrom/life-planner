import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type TaskStats = {
  blockCount: number;
  spentMinutes: number;
  focusCounts: { deep: number; shallow: number; interrupted: number };
  latestNextStep?: string;
  latestBlockedReason?: string;
};

function emptyStats(): TaskStats {
  return {
    blockCount: 0,
    spentMinutes: 0,
    focusCounts: { deep: 0, shallow: 0, interrupted: 0 },
  };
}

export async function buildTaskStatsMap(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Map<Id<"tasks">, TaskStats>> {
  const blocks = await ctx.db
    .query("timeBlocks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const map = new Map<Id<"tasks">, TaskStats>();
  const latestReviewAt = new Map<Id<"tasks">, number>();

  for (const block of blocks) {
    if (!block.taskId) continue;

    const stats = map.get(block.taskId) ?? emptyStats();
    stats.blockCount += 1;

    if (block.review) {
      stats.spentMinutes += block.review.actualMinutes;
      if (block.review.focus) {
        stats.focusCounts[block.review.focus] += 1;
      }

      const prevReviewAt = latestReviewAt.get(block.taskId) ?? -1;
      if (block.review.reviewedAt >= prevReviewAt) {
        latestReviewAt.set(block.taskId, block.review.reviewedAt);
        if (block.review.nextStep) {
          stats.latestNextStep = block.review.nextStep;
        }
        stats.latestBlockedReason = block.review.blockedReason;
      }
    }

    map.set(block.taskId, stats);
  }

  return map;
}

export function isTaskActive(
  status: Doc<"tasks">["status"],
  stats: TaskStats | undefined,
): boolean {
  return status !== "done" && (stats?.blockCount ?? 0) > 0;
}

export { emptyStats as emptyTaskStats };
