import { getDoneColumn, isTaskDone } from "./boardColumns";
import { getOwnedLabelForUser, taskHasLabel } from "./labels";
import { openBlockersForTask } from "./taskBlockers";
import { activeClaimForTask } from "./taskClaims";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Bound the total discovery work, including at most 20 blocker reads/task.
export const MAX_PULLABLE_SCAN = 200;

export async function listPullableTasksForUser(
  ctx: QueryCtx,
  userId: string,
  args: { projectId?: Id<"projects">; labelId?: Id<"labels">; limit?: number },
  now: number,
) {
  if (args.projectId) {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId)
      throw new Error("Project not found");
  }
  if (args.labelId) await getOwnedLabelForUser(ctx, userId, args.labelId);
  const candidates = await (
    args.projectId
      ? ctx.db
          .query("tasks")
          .withIndex("by_userId_and_pullable_and_projectId", (q) =>
            q
              .eq("userId", userId)
              .eq("pullable", true)
              .eq("projectId", args.projectId),
          )
      : ctx.db
          .query("tasks")
          .withIndex("by_userId_and_pullable", (q) =>
            q.eq("userId", userId).eq("pullable", true),
          )
  ).take(MAX_PULLABLE_SCAN + 1);
  const done = await getDoneColumn(ctx, userId);
  const eligible: Array<Doc<"tasks">> = [];
  for (const task of candidates.slice(0, MAX_PULLABLE_SCAN)) {
    if (task.archived || isTaskDone(task.columnId, done?._id)) continue;
    if (args.labelId && !taskHasLabel(task, args.labelId)) continue;
    if (await activeClaimForTask(ctx, task._id, now)) continue;
    if ((await openBlockersForTask(ctx, userId, task._id)).length) continue;
    eligible.push(task);
  }
  eligible.sort(
    (a, b) =>
      (a.priority ?? 4) - (b.priority ?? 4) ||
      a.order - b.order ||
      a._id.localeCompare(b._id),
  );
  const limit = args.limit ?? 20;
  const scanLimited = candidates.length > MAX_PULLABLE_SCAN;
  return {
    tasks: eligible
      .slice(0, limit)
      .map((task) => ({
        id: task._id,
        title: task.title,
        priority: task.priority ?? null,
        projectId: task.projectId ?? null,
        estimateMinutes: task.estimateMinutes ?? null,
        dueDate: task.dueDate ?? null,
      })),
    truncated: scanLimited || eligible.length > limit,
    scanLimited,
    scanned: Math.min(candidates.length, MAX_PULLABLE_SCAN),
    ...(scanLimited
      ? {
          notice: `Discovery capped at ${MAX_PULLABLE_SCAN} pullable candidates. Results are sorted within that scan, not the entire board. Narrow by projectId to discover more.`,
        }
      : {}),
  };
}
