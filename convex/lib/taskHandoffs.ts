import { internal } from "../_generated/api";
import { assertAgentMayPlaceInColumn } from "./agentGate";
import { requireColumnByName } from "./boardColumns";
import { claimForTask, requireOwnClaimForUser } from "./taskClaims";
import { getOwnedTaskForUser, updateTaskForUser } from "./taskOps";
import type { AgentCaller } from "./taskClaims";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Handoff text can approach a document's size limit. Bound bytes as well as
// row count so history and deletion retain transaction headroom.
export const HANDOFF_PAGE_BYTES = 1_000_000;

export type CompleteWorkArgs = {
  taskId: Id<"tasks">;
  summary: string;
  testList: Array<string>;
  nextSteps: Array<string>;
  tester: "agent" | "user";
  followUps?: Array<{ title: string; notes?: string }>;
};

/** Follow-ups start in backlog, without pullability, claims or blockers. */
export async function createFollowUpForUser(
  ctx: MutationCtx,
  userId: string,
  args: { title: string; notes?: string; projectId?: Id<"projects"> },
) {
  if (
    !args.title.trim() ||
    args.title.length > 500 ||
    (args.notes?.length ?? 0) > 20_000
  )
    throw new Error("Invalid follow-up title or notes");
  if (args.projectId) {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId)
      throw new Error("Project not found");
  }
  const lastRows = await ctx.db
    .query("tasks")
    .withIndex("by_userId_and_order", (q) => q.eq("userId", userId))
    .order("desc")
    .take(1);
  const last = lastRows.at(0);
  return await ctx.db.insert("tasks", {
    userId,
    title: args.title.trim(),
    notes: args.notes,
    projectId: args.projectId,
    archived: false,
    order: (last?.order ?? -1) + 1,
  });
}

export async function completeWorkForUser(
  ctx: MutationCtx,
  userId: string,
  caller: AgentCaller,
  args: CompleteWorkArgs,
  agentsCanMarkDone: boolean,
) {
  const now = Date.now();
  const claim = await requireOwnClaimForUser(
    ctx,
    userId,
    args.taskId,
    caller,
    now,
  );
  const task = await getOwnedTaskForUser(ctx, userId, args.taskId);
  const test = await requireColumnByName(ctx, userId, "test");
  await assertAgentMayPlaceInColumn(ctx, userId, {
    agentsCanMarkDone,
    targetColumnId: test._id,
    currentColumnId: task.columnId,
  });
  const followUpTaskIds: Array<Id<"tasks">> = [];
  for (const followUp of args.followUps ?? []) {
    followUpTaskIds.push(
      await createFollowUpForUser(ctx, userId, {
        ...followUp,
        projectId: task.projectId,
      }),
    );
  }
  const handoffId = await ctx.db.insert("taskHandoffs", {
    userId,
    taskId: task._id,
    tokenId: caller.tokenId,
    agent: caller.agent,
    sessionId: claim.sessionId,
    summary: args.summary,
    testList: args.testList,
    nextSteps: args.nextSteps,
    tester: args.tester,
    followUpTaskIds,
    at: now,
  });
  await updateTaskForUser(ctx, userId, {
    taskId: task._id,
    columnId: test._id,
  });
  await ctx.db.delete("taskClaims", claim._id);
  return { handoffId, followUpTaskIds, columnId: test._id };
}

export async function latestHandoffForUser(
  ctx: QueryCtx,
  userId: string,
  taskId: Id<"tasks">,
) {
  await getOwnedTaskForUser(ctx, userId, taskId);
  const rows = await ctx.db
    .query("taskHandoffs")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .order("desc")
    .take(1);
  return rows.at(0) ?? null;
}

export async function handoffHistoryForUser(
  ctx: QueryCtx,
  userId: string,
  taskId: Id<"tasks">,
) {
  await getOwnedTaskForUser(ctx, userId, taskId);
  const page = await ctx.db
    .query("taskHandoffs")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .order("desc")
    .paginate({
      numItems: 50,
      cursor: null,
      maximumRowsRead: 50,
      maximumBytesRead: HANDOFF_PAGE_BYTES,
    });
  const handoffs = [];
  for (const row of page.page) {
    const followUps = [];
    for (const id of row.followUpTaskIds) {
      const task = await ctx.db.get("tasks", id);
      followUps.push({
        id,
        title: task?.userId === userId ? task.title : "Deleted task",
        available: task?.userId === userId,
      });
    }
    handoffs.push({ ...row, followUps });
  }
  return { handoffs, truncated: !page.isDone };
}

/** Bounded cleanup; never delete follow-up tasks when the original is deleted. */
export async function deleteTaskWorkForUser(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
) {
  const claim = await claimForTask(ctx, taskId);
  if (claim) await ctx.db.delete("taskClaims", claim._id);
  const page = await ctx.db
    .query("taskHandoffs")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .paginate({
      numItems: 100,
      cursor: null,
      maximumRowsRead: 100,
      maximumBytesRead: HANDOFF_PAGE_BYTES,
    });
  for (const row of page.page) await ctx.db.delete("taskHandoffs", row._id);
  if (!page.isDone)
    await ctx.scheduler.runAfter(0, internal.taskHandoffs.cleanupDeletedTask, {
      taskId,
    });
}
