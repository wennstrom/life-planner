import { v } from "convex/values";
import {
  checklistItemValidator,
  isTaskArchived,
  normalizeChecklist,
} from "./checklist";
import {
  completedAtForMove,
  getDoneColumn,
  isTaskDone,
  requireOwnedColumn,
} from "./boardColumns";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Task business rules shared by the public mutations (Clerk auth) and the MCP
// tools (token auth). Callers resolve `userId` themselves; nothing here reads
// the auth context.

const columnIdArg = v.optional(v.union(v.id("boardColumns"), v.null()));

export const listTasksArgs = v.object({
  archived: v.optional(v.boolean()),
});

export const createTaskArgs = v.object({
  title: v.string(),
  notes: v.optional(v.string()),
  projectId: v.optional(v.id("projects")),
  dueDate: v.optional(v.string()),
  estimateMinutes: v.optional(v.number()),
  columnId: columnIdArg,
  priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
  checklist: v.optional(v.array(checklistItemValidator)),
});

export const updateTaskArgs = v.object({
  taskId: v.id("tasks"),
  title: v.optional(v.string()),
  notes: v.optional(v.union(v.string(), v.null())),
  projectId: v.optional(v.union(v.id("projects"), v.null())),
  priority: v.optional(
    v.union(v.literal(1), v.literal(2), v.literal(3), v.null()),
  ),
  dueDate: v.optional(v.union(v.string(), v.null())),
  estimateMinutes: v.optional(v.union(v.number(), v.null())),
  columnId: columnIdArg,
  checklist: v.optional(v.array(checklistItemValidator)),
  archived: v.optional(v.boolean()),
});

export type CreateTaskArgs = Infer<typeof createTaskArgs>;
export type UpdateTaskArgs = Infer<typeof updateTaskArgs>;

/** The task, if it exists and belongs to `userId`; otherwise throws. */
export async function getOwnedTaskForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  taskId: Id<"tasks">,
): Promise<Doc<"tasks">> {
  const task = await ctx.db.get("tasks", taskId);
  if (!task || task.userId !== userId) {
    throw new Error("Task not found");
  }
  return task;
}

export async function listTasksForUser(
  ctx: QueryCtx,
  userId: string,
  args: Infer<typeof listTasksArgs>,
): Promise<Array<Doc<"tasks">>> {
  const archived = args.archived ?? false;
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return tasks
    .filter((task) => isTaskArchived(task) === archived)
    .sort((a, b) => a.order - b.order);
}

export async function createTaskForUser(
  ctx: MutationCtx,
  userId: string,
  args: CreateTaskArgs,
): Promise<Id<"tasks">> {
  if (args.projectId) {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }
  }

  const columnId = args.columnId ?? undefined;
  if (columnId) {
    await requireOwnedColumn(ctx, userId, columnId);
  }

  const existing = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const done = await getDoneColumn(ctx, userId);
  const checklist =
    args.checklist !== undefined
      ? normalizeChecklist(args.checklist)
      : undefined;
  return await ctx.db.insert("tasks", {
    userId,
    title: args.title,
    notes: args.notes,
    checklist,
    archived: false,
    projectId: args.projectId,
    columnId,
    estimateMinutes: args.estimateMinutes,
    dueDate: args.dueDate,
    priority: args.priority,
    order: existing.length,
    completedAt: isTaskDone(columnId, done?._id) ? Date.now() : undefined,
  });
}

/** Patches a task. Also archives and unarchives it through `archived`. */
export async function updateTaskForUser(
  ctx: MutationCtx,
  userId: string,
  args: UpdateTaskArgs,
): Promise<void> {
  const task = await getOwnedTaskForUser(ctx, userId, args.taskId);

  if (args.projectId) {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== task.userId) {
      throw new Error("Project not found");
    }
  }

  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) patch.title = args.title;
  if (args.notes !== undefined) patch.notes = args.notes ?? undefined;
  if (args.priority !== undefined) patch.priority = args.priority ?? undefined;
  if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;
  if (args.estimateMinutes !== undefined) {
    patch.estimateMinutes = args.estimateMinutes ?? undefined;
  }
  if (args.projectId !== undefined) {
    patch.projectId = args.projectId ?? undefined;
  }
  if (args.columnId !== undefined) {
    if (args.columnId) {
      await requireOwnedColumn(ctx, userId, args.columnId);
    }
    const done = await getDoneColumn(ctx, userId);
    const wasDone = isTaskDone(task.columnId, done?._id);
    const willBeDone = isTaskDone(args.columnId ?? undefined, done?._id);
    patch.columnId = args.columnId ?? undefined;
    patch.completedAt = completedAtForMove(
      wasDone,
      willBeDone,
      task.completedAt,
    );
  }
  if (args.checklist !== undefined) {
    const checklist = normalizeChecklist(args.checklist);
    patch.checklist = checklist.length > 0 ? checklist : undefined;
  }
  if (args.archived !== undefined) {
    patch.archived = args.archived ? true : undefined;
  }

  await ctx.db.patch("tasks", args.taskId, patch);
}
