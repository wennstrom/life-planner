import { v } from "convex/values";
import { getDoneColumn, isTaskDone } from "./boardColumns";
import { isTaskArchived } from "./checklist";
import { getOwnedTaskForUser } from "./taskOps";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// "Task A is blocked by task B" edges. One row per edge in taskBlockers:
// `taskId` is A (the blocked task), `blockerTaskId` is B. Shared by the
// public functions in ../taskBlockers.ts and the MCP tools.

type Ctx = QueryCtx | MutationCtx;

export const MAX_BLOCKERS_PER_TASK = 20;
/** How deep the cycle check follows blocker chains before giving up. */
export const MAX_BLOCKER_CHAIN_DEPTH = 50;
/** Most tasks the cycle check visits. */
const MAX_CYCLE_CHECK_TASKS = 1000;
/** Most "blocking" tasks listed for one task. */
export const MAX_BLOCKING_LISTED = 100;
/** Most edges read when counting open blockers for a whole board. */
export const MAX_BOARD_BLOCKER_EDGES = 5000;
const DELETE_BATCH_SIZE = 100;

export const taskBlockerArgs = v.object({
  taskId: v.id("tasks"),
  blockerTaskId: v.id("tasks"),
});
export type TaskBlockerArgs = Infer<typeof taskBlockerArgs>;

export type BlockerView = {
  taskId: Id<"tasks">;
  title: string;
  /** Not done and not archived: the blocked task is still waiting on it. */
  open: boolean;
  done: boolean;
  archived: boolean;
};

export type BlockingView = { taskId: Id<"tasks">; title: string };

/** A blocker is open while it is neither done nor archived. */
export function isBlockerOpen(
  blocker: Doc<"tasks">,
  doneColumnId: Id<"boardColumns"> | undefined,
): boolean {
  return (
    !isTaskArchived(blocker) && !isTaskDone(blocker.columnId, doneColumnId)
  );
}

/** Edges where `taskId` is the blocked task. At most the cap plus one. */
async function edgesBlockingTask(ctx: Ctx, taskId: Id<"tasks">) {
  return await ctx.db
    .query("taskBlockers")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .take(MAX_BLOCKERS_PER_TASK + 1);
}

function quoted(title: string): string {
  const short = title.length > 60 ? `${title.slice(0, 57)}…` : title;
  return `'${short}'`;
}

/**
 * True if `start` is (transitively) blocked by `target`, i.e. adding
 * "target is blocked by start" would close a cycle. Throws if the chain is
 * deeper than MAX_BLOCKER_CHAIN_DEPTH, rather than guess.
 */
async function isTransitivelyBlockedBy(
  ctx: Ctx,
  start: Id<"tasks">,
  target: Id<"tasks">,
): Promise<boolean> {
  const seen = new Set<Id<"tasks">>([start]);
  const stack: Array<{ taskId: Id<"tasks">; depth: number }> = [
    { taskId: start, depth: 0 },
  ];
  while (stack.length > 0) {
    const { taskId, depth } = stack.pop()!;
    const edges = await edgesBlockingTask(ctx, taskId);
    for (const edge of edges) {
      if (edge.blockerTaskId === target) return true;
      if (seen.has(edge.blockerTaskId)) continue;
      if (depth + 1 >= MAX_BLOCKER_CHAIN_DEPTH) {
        throw new Error(
          `Blocker chains can be at most ${MAX_BLOCKER_CHAIN_DEPTH} tasks deep`,
        );
      }
      seen.add(edge.blockerTaskId);
      if (seen.size > MAX_CYCLE_CHECK_TASKS) {
        throw new Error("Too many linked blockers to check for a cycle");
      }
      stack.push({ taskId: edge.blockerTaskId, depth: depth + 1 });
    }
  }
  return false;
}

/**
 * Records that `taskId` is blocked by `blockerTaskId`. Both tasks must belong
 * to the user; no self-edges, duplicates or cycles; at most 20 per task.
 */
export async function addBlockerForUser(
  ctx: MutationCtx,
  userId: string,
  args: TaskBlockerArgs,
): Promise<Id<"taskBlockers">> {
  if (args.taskId === args.blockerTaskId) {
    throw new Error("A task can't block itself");
  }
  const task = await getOwnedTaskForUser(ctx, userId, args.taskId);
  const blocker = await ctx.db.get("tasks", args.blockerTaskId);
  if (!blocker || blocker.userId !== userId) {
    throw new Error("Blocker task not found");
  }

  const existing = await edgesBlockingTask(ctx, task._id);
  if (existing.some((edge) => edge.blockerTaskId === blocker._id)) {
    throw new Error(
      `${quoted(task.title)} is already blocked by ${quoted(blocker.title)}`,
    );
  }
  if (existing.length >= MAX_BLOCKERS_PER_TASK) {
    throw new Error(
      `A task can have at most ${MAX_BLOCKERS_PER_TASK} blockers`,
    );
  }
  if (await isTransitivelyBlockedBy(ctx, blocker._id, task._id)) {
    throw new Error(
      `That would make a cycle: ${quoted(blocker.title)} already waits on ${quoted(task.title)}`,
    );
  }

  return await ctx.db.insert("taskBlockers", {
    userId,
    taskId: task._id,
    blockerTaskId: blocker._id,
    createdAt: Date.now(),
  });
}

/** Removes the edge. False if `taskId` wasn't blocked by `blockerTaskId`. */
export async function removeBlockerForUser(
  ctx: MutationCtx,
  userId: string,
  args: TaskBlockerArgs,
): Promise<boolean> {
  await getOwnedTaskForUser(ctx, userId, args.taskId);
  const edges = await edgesBlockingTask(ctx, args.taskId);
  const edge = edges.find((row) => row.blockerTaskId === args.blockerTaskId);
  if (!edge || edge.userId !== userId) return false;
  await ctx.db.delete("taskBlockers", edge._id);
  return true;
}

/** What blocks the task, and what it blocks (capped at 100). */
export async function listBlockersForTask(
  ctx: Ctx,
  userId: string,
  taskId: Id<"tasks">,
): Promise<{ blockedBy: Array<BlockerView>; blocking: Array<BlockingView> }> {
  await getOwnedTaskForUser(ctx, userId, taskId);
  const done = await getDoneColumn(ctx, userId);

  const blockedBy: Array<BlockerView> = [];
  for (const edge of await edgesBlockingTask(ctx, taskId)) {
    const blocker = await ctx.db.get("tasks", edge.blockerTaskId);
    if (!blocker || blocker.userId !== userId) continue;
    blockedBy.push({
      taskId: blocker._id,
      title: blocker.title,
      open: isBlockerOpen(blocker, done?._id),
      done: isTaskDone(blocker.columnId, done?._id),
      archived: isTaskArchived(blocker),
    });
  }

  const blockingEdges = await ctx.db
    .query("taskBlockers")
    .withIndex("by_blocker", (q) => q.eq("blockerTaskId", taskId))
    .take(MAX_BLOCKING_LISTED);
  const blocking: Array<BlockingView> = [];
  for (const edge of blockingEdges) {
    const blocked = await ctx.db.get("tasks", edge.taskId);
    if (!blocked || blocked.userId !== userId) continue;
    blocking.push({ taskId: blocked._id, title: blocked.title });
  }

  return { blockedBy, blocking };
}

/**
 * The task's blockers that are still open (not done, not archived). Empty
 * means the task is free to start. For claim checks and pullable listings.
 */
export async function openBlockersForTask(
  ctx: Ctx,
  userId: string,
  taskId: Id<"tasks">,
): Promise<Array<Doc<"tasks">>> {
  const done = await getDoneColumn(ctx, userId);
  const open: Array<Doc<"tasks">> = [];
  for (const edge of await edgesBlockingTask(ctx, taskId)) {
    if (edge.userId !== userId) continue;
    const blocker = await ctx.db.get("tasks", edge.blockerTaskId);
    if (blocker && blocker.userId === userId && isBlockerOpen(blocker, done?._id)) {
      open.push(blocker);
    }
  }
  return open;
}

/**
 * Open-blocker counts for many tasks at once (the board), from one indexed
 * read of the user's edges. `tasksById` must hold every task that can be a
 * blocker, archived ones included; missing blockers count as closed.
 */
export async function openBlockerCountsForUser(
  ctx: Ctx,
  userId: string,
  tasksById: Map<Id<"tasks">, Doc<"tasks">>,
  doneColumnId: Id<"boardColumns"> | undefined,
): Promise<Map<Id<"tasks">, number>> {
  const edges = await ctx.db
    .query("taskBlockers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_BOARD_BLOCKER_EDGES);
  const counts = new Map<Id<"tasks">, number>();
  for (const edge of edges) {
    const blocker = tasksById.get(edge.blockerTaskId);
    if (!blocker || !isBlockerOpen(blocker, doneColumnId)) continue;
    counts.set(edge.taskId, (counts.get(edge.taskId) ?? 0) + 1);
  }
  return counts;
}

/** Deletes every edge into or out of a task. Call when deleting the task. */
export async function deleteBlockerEdgesForTask(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  const batches = [
    () =>
      ctx.db
        .query("taskBlockers")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .take(DELETE_BATCH_SIZE),
    () =>
      ctx.db
        .query("taskBlockers")
        .withIndex("by_blocker", (q) => q.eq("blockerTaskId", taskId))
        .take(DELETE_BATCH_SIZE),
  ];
  for (const nextBatch of batches) {
    for (;;) {
      const rows = await nextBatch();
      for (const row of rows) {
        await ctx.db.delete("taskBlockers", row._id);
      }
      if (rows.length < DELETE_BATCH_SIZE) break;
    }
  }
}
