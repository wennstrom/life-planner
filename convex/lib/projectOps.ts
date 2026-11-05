import { v } from "convex/values";
import type { Infer } from "convex/values";
import { getDoneColumn, isTaskDone } from "./boardColumns";
import { isTaskArchived } from "./checklist";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const listProjectsArgs = v.object({
  status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
});

/** The user's projects with one status (active by default), in board order. */
export async function listProjectsForUser(
  ctx: QueryCtx,
  userId: string,
  args: Infer<typeof listProjectsArgs>,
): Promise<Array<Doc<"projects">>> {
  const status = args.status ?? "active";

  const projects = await ctx.db
    .query("projects")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", status),
    )
    .collect();

  return projects.sort((a, b) => a.order - b.order);
}

// --- agent context -----------------------------------------------------------

/** Longest `projects.agentContext` we store, in characters. */
export const AGENT_CONTEXT_MAX_LENGTH = 10_000;

/** How many of a project's tasks get_project_context looks at to count open ones. */
export const OPEN_TASK_SCAN_LIMIT = 500;

export const setAgentContextArgs = v.object({
  projectId: v.id("projects"),
  /** Markdown. An empty or blank string clears it. */
  agentContext: v.string(),
});

/** Trims the context and rejects it if it is too long. "" means clear. */
export function parseAgentContext(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > AGENT_CONTEXT_MAX_LENGTH) {
    throw new Error(
      `Context for agents can be at most ${AGENT_CONTEXT_MAX_LENGTH.toLocaleString("en-US")} characters (got ${trimmed.length.toLocaleString("en-US")})`,
    );
  }
  return trimmed;
}

export async function requireOwnedProjectForUser(
  ctx: QueryCtx,
  userId: string,
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (!project || project.userId !== userId) {
    throw new Error("Project not found");
  }
  return project;
}

/** Sets or clears the markdown agents read before working on the project. */
export async function setProjectAgentContextForUser(
  ctx: MutationCtx,
  userId: string,
  args: Infer<typeof setAgentContextArgs>,
): Promise<void> {
  await requireOwnedProjectForUser(ctx, userId, args.projectId);
  const agentContext = parseAgentContext(args.agentContext);
  await ctx.db.patch("projects", args.projectId, {
    agentContext: agentContext === "" ? undefined : agentContext,
  });
}

export type ProjectContext = {
  project: Doc<"projects">;
  /** Not archived and not in the done column. At most OPEN_TASK_SCAN_LIMIT. */
  openTaskCount: number;
  /** True when the project has more tasks than were scanned. */
  openTaskCountCapped: boolean;
};

/** What an agent needs to start work on a project cold. */
export async function getProjectContextForUser(
  ctx: QueryCtx,
  userId: string,
  projectId: Id<"projects">,
): Promise<ProjectContext> {
  const project = await requireOwnedProjectForUser(ctx, userId, projectId);
  const done = await getDoneColumn(ctx, userId);
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(OPEN_TASK_SCAN_LIMIT + 1);
  const scanned = tasks.slice(0, OPEN_TASK_SCAN_LIMIT);
  const openTaskCount = scanned.filter(
    (task) =>
      task.userId === userId &&
      !isTaskArchived(task) &&
      !isTaskDone(task.columnId, done?._id),
  ).length;
  return {
    project,
    openTaskCount,
    openTaskCountCapped: tasks.length > OPEN_TASK_SCAN_LIMIT,
  };
}
