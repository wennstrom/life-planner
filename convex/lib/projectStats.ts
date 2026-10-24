import { listColumnsForUser } from "./boardColumns";
import { isTaskArchived } from "./checklist";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const PROJECT_LOG_DEFAULT_LIMIT = 30;
export const PROJECT_LOG_MAX_LIMIT = 200;

export type FocusMinutes = { deep: number; shallow: number; other: number };

export type ProjectTimeStats = {
  plannedWeekMinutes: number;
  spentWeekMinutes: number;
  spentAllTimeMinutes: number;
  focusAllTime: FocusMinutes;
  focusWeek: FocusMinutes;
  lastBlockStart?: number;
  nextBlockStart?: number;
  nextAction?: { taskId: Id<"tasks">; title: string };
  latestNextStep?: { taskId: Id<"tasks">; text: string; reviewedAt: number };
  remaining: {
    estimatedMinutes: number;
    unestimatedCount: number;
    openCount: number;
  };
};

export type StatsWindow = {
  weekStartMs: number;
  weekEndMs: number;
  nowMs: number;
};

export function emptyProjectTimeStats(): ProjectTimeStats {
  return {
    plannedWeekMinutes: 0,
    spentWeekMinutes: 0,
    spentAllTimeMinutes: 0,
    focusAllTime: { deep: 0, shallow: 0, other: 0 },
    focusWeek: { deep: 0, shallow: 0, other: 0 },
    remaining: { estimatedMinutes: 0, unestimatedCount: 0, openCount: 0 },
  };
}

export function assertValidWindow(window: StatsWindow) {
  if (window.weekEndMs <= window.weekStartMs) {
    throw new Error("Week end must be after week start");
  }
}

/**
 * Splits a block's minutes evenly across its memberships. Leftover minutes go
 * to the lowest positions, so the shares always sum to the block's length.
 */
export function splitMinutes(totalMinutes: number, count: number): Array<number> {
  if (count <= 0) return [];
  const whole = Math.max(0, Math.floor(totalMinutes));
  const base = Math.floor(whole / count);
  const leftover = whole - base * count;
  return Array.from({ length: count }, (_, i) =>
    i < leftover ? base + 1 : base,
  );
}

export function focusBucket(
  focus: "deep" | "shallow" | "interrupted" | undefined,
): keyof FocusMinutes {
  if (focus === "deep") return "deep";
  if (focus === "shallow") return "shallow";
  return "other";
}

export function isInWeek(startMs: number, window: StatsWindow): boolean {
  return startMs >= window.weekStartMs && startMs < window.weekEndMs;
}

type OrderableTask = {
  _id: Id<"tasks">;
  title: string;
  order: number;
  columnId?: Id<"boardColumns">;
};

/**
 * The next action reads the board right to left: the non-done column closest
 * to Done first, then earlier columns, then the unassigned Backlog bucket.
 * Callers pass open tasks only.
 */
export function pickNextAction<T extends OrderableTask>(
  openTasks: Array<T>,
  columns: Array<{ _id: Id<"boardColumns">; isDone: boolean }>,
): T | undefined {
  const rank = new Map<string, number>();
  const notDone = columns.filter((column) => !column.isDone);
  notDone.forEach((column, i) => rank.set(column._id, notDone.length - 1 - i));
  const backlogRank = notDone.length;
  const columnRank = (task: T) =>
    task.columnId !== undefined && rank.has(task.columnId)
      ? rank.get(task.columnId)!
      : backlogRank;

  let best: T | undefined;
  for (const task of openTasks) {
    if (!best) {
      best = task;
      continue;
    }
    const diff = columnRank(task) - columnRank(best);
    if (
      diff < 0 ||
      (diff === 0 &&
        (task.order < best.order ||
          (task.order === best.order && task._id.localeCompare(best._id) < 0)))
    ) {
      best = task;
    }
  }
  return best;
}

export async function buildProjectStatsMap(
  ctx: QueryCtx,
  userId: string,
  window: StatsWindow,
): Promise<Map<Id<"projects">, ProjectTimeStats>> {
  const map = new Map<Id<"projects">, ProjectTimeStats>();
  const statsFor = (projectId: Id<"projects">) => {
    let stats = map.get(projectId);
    if (!stats) {
      stats = emptyProjectTimeStats();
      map.set(projectId, stats);
    }
    return stats;
  };

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const taskById = new Map(tasks.map((task) => [task._id, task]));

  const columns = await listColumnsForUser(ctx, userId);
  const doneColumnId = columns.find((column) => column.isDone)?._id;
  const isOpen = (task: Doc<"tasks">) =>
    !isTaskArchived(task) &&
    !(doneColumnId !== undefined && task.columnId === doneColumnId);

  const rows = await ctx.db
    .query("timeBlockTasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const rowsByBlock = new Map<Id<"timeBlocks">, Array<Doc<"timeBlockTasks">>>();
  for (const row of rows) {
    const list = rowsByBlock.get(row.blockId) ?? [];
    list.push(row);
    rowsByBlock.set(row.blockId, list);
  }

  const spentByTask = new Map<Id<"tasks">, number>();

  for (const [blockId, blockRows] of rowsByBlock) {
    const block = await ctx.db.get("timeBlocks", blockId);
    if (!block || block.userId !== userId) continue;

    blockRows.sort(
      (a, b) => a.order - b.order || a._id.localeCompare(b._id),
    );
    const shares = splitMinutes(
      (block.end - block.start) / 60000,
      blockRows.length,
    );
    const inWeek = isInWeek(block.start, window);
    const seenProjects = new Set<Id<"projects">>();

    blockRows.forEach((row, i) => {
      if (row.review) {
        spentByTask.set(
          row.taskId,
          (spentByTask.get(row.taskId) ?? 0) + row.review.actualMinutes,
        );
      }

      const task = taskById.get(row.taskId);
      const projectId = task?.projectId;
      if (!task || !projectId) return;
      const stats = statsFor(projectId);

      if (inWeek) stats.plannedWeekMinutes += shares[i];

      if (row.review) {
        const minutes = row.review.actualMinutes;
        const bucket = focusBucket(row.review.focus);
        stats.spentAllTimeMinutes += minutes;
        stats.focusAllTime[bucket] += minutes;
        if (inWeek) {
          stats.spentWeekMinutes += minutes;
          stats.focusWeek[bucket] += minutes;
        }

        const nextStep = row.review.nextStep?.trim();
        if (
          nextStep &&
          isOpen(task) &&
          (!stats.latestNextStep ||
            row.review.reviewedAt >= stats.latestNextStep.reviewedAt)
        ) {
          stats.latestNextStep = {
            taskId: task._id,
            text: nextStep,
            reviewedAt: row.review.reviewedAt,
          };
        }
      }

      if (seenProjects.has(projectId)) return;
      seenProjects.add(projectId);
      if (block.start <= window.nowMs) {
        if (
          stats.lastBlockStart === undefined ||
          block.start > stats.lastBlockStart
        ) {
          stats.lastBlockStart = block.start;
        }
      } else if (
        stats.nextBlockStart === undefined ||
        block.start < stats.nextBlockStart
      ) {
        stats.nextBlockStart = block.start;
      }
    });
  }

  const openByProject = new Map<Id<"projects">, Array<Doc<"tasks">>>();
  for (const task of tasks) {
    if (!task.projectId || !isOpen(task)) continue;
    const list = openByProject.get(task.projectId) ?? [];
    list.push(task);
    openByProject.set(task.projectId, list);
  }

  for (const [projectId, openTasks] of openByProject) {
    const stats = statsFor(projectId);
    stats.remaining.openCount = openTasks.length;
    for (const task of openTasks) {
      if (task.estimateMinutes === undefined) {
        stats.remaining.unestimatedCount += 1;
      } else {
        stats.remaining.estimatedMinutes += Math.max(
          task.estimateMinutes - (spentByTask.get(task._id) ?? 0),
          0,
        );
      }
    }
    const next = pickNextAction(openTasks, columns);
    if (next) stats.nextAction = { taskId: next._id, title: next.title };
  }

  return map;
}
