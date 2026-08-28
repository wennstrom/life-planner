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
  userId: string,
): Promise<Map<Id<"tasks">, TaskStats>> {
  const rows = await ctx.db
    .query("timeBlockTasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const map = new Map<Id<"tasks">, TaskStats>();
  const latestReviewAt = new Map<Id<"tasks">, number>();

  for (const row of rows) {
    const stats = map.get(row.taskId) ?? emptyStats();
    stats.blockCount += 1;

    if (row.review) {
      stats.spentMinutes += row.review.actualMinutes;
      if (row.review.focus) {
        stats.focusCounts[row.review.focus] += 1;
      }

      const prevReviewAt = latestReviewAt.get(row.taskId) ?? -1;
      if (row.review.reviewedAt >= prevReviewAt) {
        latestReviewAt.set(row.taskId, row.review.reviewedAt);
        if (row.review.nextStep) {
          stats.latestNextStep = row.review.nextStep;
        }
        stats.latestBlockedReason = row.review.blockedReason;
      }
    }

    map.set(row.taskId, stats);
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
