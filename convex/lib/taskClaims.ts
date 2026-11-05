import { internal } from "../_generated/api";
import { assertAgentMayPlaceInColumn } from "./agentGate";
import { INVALID_SESSION_ID_ERROR, isValidSessionId } from "./agentSession";
import { findColumnByName, getDoneColumn, isTaskDone } from "./boardColumns";
import { openBlockersForTask } from "./taskBlockers";
import { getOwnedTaskForUser, updateTaskForUser } from "./taskOps";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type AgentCaller = {
  tokenId: Id<"apiTokens">;
  agent: string;
  sessionId: string | undefined;
};
export const CLAIM_CLEANUP_BATCH = 100;

export function requireAgentSession(caller: AgentCaller): string {
  if (caller.sessionId === undefined) {
    throw new Error(
      "A session is required. Send X-Agent-Session or pass sessionId.",
    );
  }
  if (!isValidSessionId(caller.sessionId))
    throw new Error(INVALID_SESSION_ID_ERROR);
  return caller.sessionId;
}

export function leaseDuration(leaseMinutes = 30): number {
  if (
    !Number.isFinite(leaseMinutes) ||
    !Number.isInteger(leaseMinutes) ||
    leaseMinutes <= 0 ||
    leaseMinutes > 120
  ) {
    throw new Error("leaseMinutes must be a positive integer, at most 120");
  }
  return leaseMinutes * 60_000;
}

export async function claimForTask(ctx: QueryCtx, taskId: Id<"tasks">) {
  return await ctx.db
    .query("taskClaims")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .unique();
}

export async function activeClaimForTask(
  ctx: QueryCtx,
  taskId: Id<"tasks">,
  now: number,
) {
  const claim = await claimForTask(ctx, taskId);
  return claim && claim.expiresAt > now ? claim : null;
}

export function claimView(
  claim: Pick<
    Doc<"taskClaims">,
    "agent" | "sessionId" | "claimedAt" | "expiresAt"
  > | null,
) {
  return claim
    ? {
        agent: claim.agent,
        sessionId: claim.sessionId,
        claimedAt: claim.claimedAt,
        expiresAt: claim.expiresAt,
      }
    : null;
}

/** MCP-only guard. Humans keep access through their normal public mutations. */
export async function assertAgentMayWriteTaskForUser(
  ctx: QueryCtx,
  userId: string,
  taskId: Id<"tasks">,
  caller: AgentCaller,
  now: number,
) {
  await getOwnedTaskForUser(ctx, userId, taskId);
  const claim = await activeClaimForTask(ctx, taskId, now);
  if (
    claim &&
    (claim.tokenId !== caller.tokenId || claim.sessionId !== caller.sessionId)
  ) {
    throw new Error(
      `Claimed by ${claim.agent} until ${new Date(claim.expiresAt).toISOString()}`,
    );
  }
  return claim;
}

export async function requireOwnClaimForUser(
  ctx: QueryCtx,
  userId: string,
  taskId: Id<"tasks">,
  caller: AgentCaller,
  now: number,
) {
  requireAgentSession(caller);
  const claim = await assertAgentMayWriteTaskForUser(
    ctx,
    userId,
    taskId,
    caller,
    now,
  );
  if (!claim)
    throw new Error(
      "No active claim held by this token and session. Claim the task first.",
    );
  return claim;
}

export async function claimTaskForUser(
  ctx: MutationCtx,
  userId: string,
  caller: AgentCaller,
  args: {
    taskId: Id<"tasks">;
    leaseMinutes?: number;
    agentsCanMarkDone: boolean;
  },
) {
  const sessionId = requireAgentSession(caller);
  const duration = leaseDuration(args.leaseMinutes);
  const now = Date.now();
  const current = await assertAgentMayWriteTaskForUser(
    ctx,
    userId,
    args.taskId,
    caller,
    now,
  );
  const task = await getOwnedTaskForUser(ctx, userId, args.taskId);
  if (task.archived) throw new Error("Cannot claim an archived task");
  if (isTaskDone(task.columnId, (await getDoneColumn(ctx, userId))?._id))
    throw new Error("Cannot claim a done task");
  if (!task.pullable)
    throw new Error(
      "The user must mark this task pullable before you can claim it",
    );
  const blockers = await openBlockersForTask(ctx, userId, task._id);
  if (blockers.length)
    throw new Error(`Blocked by: ${blockers.map((b) => b.title).join(", ")}`);
  const column = await findColumnByName(ctx, userId, "in progress");
  if (column) {
    await assertAgentMayPlaceInColumn(ctx, userId, {
      agentsCanMarkDone: args.agentsCanMarkDone,
      targetColumnId: column._id,
      currentColumnId: task.columnId,
    });
    await updateTaskForUser(ctx, userId, {
      taskId: task._id,
      columnId: column._id,
    });
  }
  const expiresAt = now + duration;
  // Reuse an expired row too. Indexed reads participate in Convex's OCC, so
  // simultaneous contenders retry and only one token/session can win.
  const row = current ?? (await claimForTask(ctx, task._id));
  const value = {
    userId,
    taskId: task._id,
    tokenId: caller.tokenId,
    agent: caller.agent,
    sessionId,
    claimedAt: current?.claimedAt ?? now,
    expiresAt,
  };
  if (row) await ctx.db.replace("taskClaims", row._id, value);
  else await ctx.db.insert("taskClaims", value);
  return claimView(value);
}

export async function heartbeatClaimForUser(
  ctx: MutationCtx,
  userId: string,
  caller: AgentCaller,
  args: { taskId: Id<"tasks">; leaseMinutes?: number },
) {
  const duration = leaseDuration(args.leaseMinutes);
  const now = Date.now();
  const claim = await requireOwnClaimForUser(
    ctx,
    userId,
    args.taskId,
    caller,
    now,
  );
  const expiresAt = now + duration;
  await ctx.db.patch("taskClaims", claim._id, { expiresAt });
  return claimView({ ...claim, expiresAt });
}

export async function releaseClaimForUser(
  ctx: MutationCtx,
  userId: string,
  caller: AgentCaller,
  taskId: Id<"tasks">,
) {
  const claim = await requireOwnClaimForUser(
    ctx,
    userId,
    taskId,
    caller,
    Date.now(),
  );
  await ctx.db.delete("taskClaims", claim._id);
}

export async function forceReleaseForUser(
  ctx: MutationCtx,
  userId: string,
  taskId: Id<"tasks">,
) {
  await getOwnedTaskForUser(ctx, userId, taskId);
  const claim = await claimForTask(ctx, taskId);
  if (claim) await ctx.db.delete("taskClaims", claim._id);
}

export async function cleanupExpiredForUser(ctx: MutationCtx, now: number) {
  const rows = await ctx.db
    .query("taskClaims")
    .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
    .take(CLAIM_CLEANUP_BATCH);
  for (const row of rows) await ctx.db.delete("taskClaims", row._id);
  if (rows.length === CLAIM_CLEANUP_BATCH)
    await ctx.scheduler.runAfter(0, internal.taskClaims.cleanupExpired, {});
  return rows.length;
}
