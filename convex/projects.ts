import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { isBoardColumnColor } from "./lib/boardColumnColors";
import { listColumnsForUser } from "./lib/boardColumns";
import { isTaskArchived } from "./lib/checklist";
import {
  HEALTH_NOTE_MAX_LENGTH,
  isCalendarGoalDate,
  isProjectHealth,
  type ProjectHealth,
} from "./lib/projectHealth";
import {
  PROJECT_LOG_DEFAULT_LIMIT,
  PROJECT_LOG_MAX_LIMIT,
  assertValidWindow,
  buildProjectStatsMap,
  emptyProjectTimeStats,
  type ProjectTimeStats,
} from "./lib/projectStats";
import { scheduleBlockDelete } from "./timeBlocks";
import {
  attachBlockViews,
  deleteMembershipsForTask,
  membershipsForBlock,
} from "./lib/timeBlockMemberships";
import type { Doc, Id } from "./_generated/dataModel";

const healthValidator = v.union(
  v.literal("onTrack"),
  v.literal("atRisk"),
  v.literal("offTrack"),
);

const statsWindowArgs = {
  weekStartMs: v.number(),
  weekEndMs: v.number(),
  nowMs: v.number(),
};

function parseHealthNote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > HEALTH_NOTE_MAX_LENGTH) {
    throw new Error("Health note is too long");
  }
  return trimmed;
}

function parseGoalDate(value: string): string {
  if (!isCalendarGoalDate(value)) {
    throw new Error("Invalid goal date");
  }
  return value;
}

function storedProjectFields(
  project: Doc<"projects">,
  omit: {
    description?: boolean;
    goalDate?: boolean;
    health?: boolean;
    healthNote?: boolean;
  } = {},
) {
  const {
    _id: _id,
    _creationTime: _creationTime,
    description,
    goalDate,
    health,
    healthNote,
    ...rest
  } = project;
  return {
    ...rest,
    ...(!omit.description && description !== undefined ? { description } : {}),
    ...(!omit.goalDate && goalDate !== undefined ? { goalDate } : {}),
    ...(!omit.health && health !== undefined ? { health } : {}),
    ...(!omit.healthNote && healthNote !== undefined ? { healthNote } : {}),
  };
}

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const status = args.status ?? "active";

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", status),
      )
      .collect();

    return projects.sort((a, b) => a.order - b.order);
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return {
      project,
      tasks: tasks
        .filter((task) => !isTaskArchived(task))
        .sort((a, b) => a.order - b.order),
    };
  },
});

async function requireOwnedProject(
  ctx: Parameters<typeof buildProjectStatsMap>[0],
  userId: string,
  projectId: Id<"projects">,
) {
  const project = await ctx.db.get("projects", projectId);
  if (!project || project.userId !== userId) {
    throw new Error("Project not found");
  }
  return project;
}

export const stats = query({
  args: statsWindowArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    assertValidWindow(args);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .collect();
    const map = await buildProjectStatsMap(ctx, userId, args);
    const result: Record<Id<"projects">, ProjectTimeStats> = {};
    for (const project of projects) {
      result[project._id] = map.get(project._id) ?? emptyProjectTimeStats();
    }
    return result;
  },
});

export const statsFor = query({
  args: { projectId: v.id("projects"), ...statsWindowArgs },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { projectId, ...window } = args;
    assertValidWindow(window);
    await requireOwnedProject(ctx, userId, projectId);
    const map = await buildProjectStatsMap(ctx, userId, window);
    return map.get(projectId) ?? emptyProjectTimeStats();
  },
});

export const log = query({
  args: {
    projectId: v.id("projects"),
    nowMs: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireOwnedProject(ctx, userId, args.projectId);
    const limit = Math.min(
      Math.max(1, Math.floor(args.limit ?? PROJECT_LOG_DEFAULT_LIMIT)),
      PROJECT_LOG_MAX_LIMIT,
    );

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const blockIds = new Set<Id<"timeBlocks">>();
    for (const task of tasks) {
      if (task.userId !== userId) continue;
      const rows = await ctx.db
        .query("timeBlockTasks")
        .withIndex("by_user_task", (q) =>
          q.eq("userId", userId).eq("taskId", task._id),
        )
        .collect();
      for (const row of rows) blockIds.add(row.blockId);
    }

    const blocks: Array<Doc<"timeBlocks">> = [];
    for (const blockId of blockIds) {
      const block = await ctx.db.get("timeBlocks", blockId);
      if (block && block.userId === userId && block.end <= args.nowMs) {
        blocks.push(block);
      }
    }
    blocks.sort((a, b) => b.start - a.start);

    return {
      blocks: await attachBlockViews(ctx, blocks.slice(0, limit)),
      hasMore: blocks.length > limit,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    health: v.optional(healthValidator),
    healthNote: v.optional(v.string()),
    goalDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!isBoardColumnColor(args.color)) {
      throw new Error("Invalid project color");
    }
    if (args.health !== undefined && !isProjectHealth(args.health)) {
      throw new Error("Invalid project health");
    }
    const goalDate =
      args.goalDate !== undefined ? parseGoalDate(args.goalDate) : undefined;

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .collect();

    const description = args.description?.trim();
    const healthNote =
      args.health !== undefined && args.healthNote !== undefined
        ? parseHealthNote(args.healthNote)
        : undefined;

    return await ctx.db.insert("projects", {
      userId,
      name: args.name,
      ...(description ? { description } : {}),
      color: args.color,
      status: "active",
      order: existing.length,
      ...(args.health !== undefined ? { health: args.health } : {}),
      ...(healthNote ? { healthNote } : {}),
      ...(goalDate ? { goalDate } : {}),
    });
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    health: v.optional(v.union(healthValidator, v.null())),
    healthNote: v.optional(v.union(v.string(), v.null())),
    goalDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }

    const {
      projectId,
      description,
      name,
      color,
      status,
      health,
      healthNote,
      goalDate,
    } = args;
    const patch: {
      name?: string;
      color?: string;
      status?: "active" | "archived";
      health?: ProjectHealth;
      healthNote?: string;
      goalDate?: string;
    } = {};
    if (color !== undefined) {
      if (!isBoardColumnColor(color)) {
        throw new Error("Invalid project color");
      }
      patch.color = color;
    }
    if (name !== undefined) {
      const trimmed = name.trim();
      if (trimmed === "") {
        throw new Error("Name is required");
      }
      patch.name = trimmed;
    }
    if (status !== undefined) patch.status = status;
    const clearHealth = health === null;
    if (health !== undefined && !clearHealth) {
      if (!isProjectHealth(health)) {
        throw new Error("Invalid project health");
      }
      patch.health = health;
    }

    // A reason without a health value means nothing, so clearing health
    // clears the note too. Changing health keeps it unless a new one is sent.
    const parsedHealthNote =
      typeof healthNote === "string" ? parseHealthNote(healthNote) : undefined;
    const clearHealthNote =
      clearHealth ||
      healthNote === null ||
      parsedHealthNote === "" ||
      (parsedHealthNote !== undefined &&
        health === undefined &&
        project.health === undefined);
    if (parsedHealthNote && !clearHealthNote) {
      patch.healthNote = parsedHealthNote;
    }

    const clearGoalDate = goalDate === null || goalDate === "";
    if (goalDate !== undefined && !clearGoalDate) {
      patch.goalDate = parseGoalDate(goalDate);
    }

    const trimmedDescription =
      description !== undefined ? description.trim() : undefined;
    const clearDescription = trimmedDescription === "";
    const needsReplace =
      clearDescription ||
      clearGoalDate ||
      clearHealth ||
      (clearHealthNote && project.healthNote !== undefined);

    if (needsReplace) {
      await ctx.db.replace("projects", projectId, {
        ...storedProjectFields(project, {
          description: clearDescription,
          goalDate: clearGoalDate,
          health: clearHealth,
          healthNote: clearHealthNote,
        }),
        ...patch,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });
      return;
    }

    if (trimmedDescription !== undefined) {
      await ctx.db.patch("projects", projectId, {
        ...patch,
        description: trimmedDescription,
      });
      return;
    }

    await ctx.db.patch("projects", projectId, patch);
  },
});

export const remove = mutation({
  args: {
    projectId: v.id("projects"),
    deleteTasks: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    if (args.deleteTasks) {
      for (const task of tasks) {
        const blockIds = await deleteMembershipsForTask(ctx, task._id);
        for (const blockId of blockIds) {
          const remaining = await membershipsForBlock(ctx, blockId);
          if (remaining.length === 0) {
            const block = await ctx.db.get("timeBlocks", blockId);
            if (block) await scheduleBlockDelete(ctx, blockId);
          }
        }
        await ctx.db.delete("tasks", task._id);
      }
    } else {
      for (const task of tasks) {
        await ctx.db.patch("tasks", task._id, { projectId: undefined });
      }
    }

    await ctx.db.delete("projects", args.projectId);
  },
});

export const placeOnBoard = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }

    const namedColumns = await listColumnsForUser(ctx, userId);
    const first = namedColumns[0];
    if (!first) {
      throw new Error("No board columns");
    }
    const namedIds = new Set(namedColumns.map((column) => column._id));

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const task of tasks) {
      if (isTaskArchived(task)) continue;
      if (task.userId !== userId) continue;
      const columnId = task.columnId;
      const unassigned = columnId === undefined || !namedIds.has(columnId);
      if (!unassigned) continue;
      await ctx.db.patch("tasks", task._id, { columnId: first._id });
    }

    return null;
  },
});

export const reorder = mutation({
  args: {
    projectIds: v.array(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    for (let i = 0; i < args.projectIds.length; i++) {
      const project = await ctx.db.get("projects", args.projectIds[i]);
      if (!project || project.userId !== userId) {
        throw new Error("Project not found");
      }
      await ctx.db.patch("projects", args.projectIds[i], { order: i });
    }
  },
});
