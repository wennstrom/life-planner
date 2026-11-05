import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { isTaskArchived } from "./lib/checklist";
import { BACKLOG_COLUMN_COLOR } from "./lib/boardColumnColors";
import { isTaskDone, listColumnsForUser } from "./lib/boardColumns";
import { listLabelsForUser } from "./lib/labels";
import {
  buildTaskStatsMap,
  emptyTaskStats,
  isTaskActive,
  type TaskStats,
} from "./lib/taskStats";
import { openBlockerCountsForUser } from "./lib/taskBlockers";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

type LabelChip = { _id: Id<"labels">; name: string; color: string };

async function labelChipMap(
  ctx: QueryCtx,
  userId: string,
): Promise<Map<Id<"labels">, LabelChip>> {
  const labels = await listLabelsForUser(ctx, userId);
  return new Map(
    labels.map((label) => [
      label._id,
      { _id: label._id, name: label.name, color: label.color },
    ]),
  );
}

function enrichTask(
  task: Doc<"tasks">,
  projectMap: Map<Id<"projects">, Doc<"projects">>,
  statsMap: Map<Id<"tasks">, TaskStats>,
  doneColumnId: Id<"boardColumns"> | undefined,
  labelMap: Map<Id<"labels">, LabelChip>,
  openBlockerCounts: Map<Id<"tasks">, number>,
) {
  const stats = statsMap.get(task._id) ?? emptyTaskStats();
  const isDone = isTaskDone(task.columnId, doneColumnId);
  return {
    ...task,
    project: task.projectId ? (projectMap.get(task.projectId) ?? null) : null,
    stats,
    isDone,
    active: isTaskActive(isDone, stats),
    labels: (task.labelIds ?? []).flatMap((id) => {
      const label = labelMap.get(id);
      return label ? [label] : [];
    }),
    openBlockerCount: openBlockerCounts.get(task._id) ?? 0,
  };
}

function sortTasks(tasks: Array<Doc<"tasks">>) {
  return [...tasks].sort(
    (a, b) => a.order - b.order || a._id.localeCompare(b._id),
  );
}

export const get = query({
  args: {
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const archived = args.archived ?? false;

    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const tasks = sortTasks(
      allTasks.filter((task) => isTaskArchived(task) === archived),
    );

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projectMap = new Map(projects.map((p) => [p._id, p]));
    const statsMap = await buildTaskStatsMap(ctx, userId);
    const done = (await listColumnsForUser(ctx, userId)).find(
      (column) => column.isDone,
    );
    const labelMap = await labelChipMap(ctx, userId);
    const openBlockerCounts = await openBlockerCountsForUser(
      ctx,
      userId,
      new Map(allTasks.map((task) => [task._id, task])),
      done?._id,
    );

    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        color: string | null;
        tasks: Array<ReturnType<typeof enrichTask>>;
      }
    >();

    for (const task of tasks) {
      const key = task.projectId ?? "none";
      if (!groups.has(key)) {
        const project = task.projectId
          ? projectMap.get(task.projectId)
          : null;
        groups.set(key, {
          key,
          label: project?.name ?? "No project",
          color: project?.color ?? null,
          tasks: [],
        });
      }
      groups
        .get(key)!
        .tasks.push(
          enrichTask(task, projectMap, statsMap, done?._id, labelMap, openBlockerCounts),
        );
    }

    return {
      total: tasks.length,
      groups: Array.from(groups.values()),
    };
  },
});

export const board = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.userId !== userId) {
        throw new Error("Project not found");
      }
    }

    const namedColumns = await listColumnsForUser(ctx, userId);
    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const tasks = allTasks.filter((task) => {
      if (isTaskArchived(task)) return false;
      if (args.projectId && task.projectId !== args.projectId) return false;
      return true;
    });
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projectMap = new Map(projects.map((p) => [p._id, p]));
    const statsMap = await buildTaskStatsMap(ctx, userId);
    const doneColumnId = namedColumns.find((column) => column.isDone)?._id;
    const labelMap = await labelChipMap(ctx, userId);
    const openBlockerCounts = await openBlockerCountsForUser(
      ctx,
      userId,
      new Map(allTasks.map((task) => [task._id, task])),
      doneColumnId,
    );

    const enrich = (task: Doc<"tasks">) =>
      enrichTask(task, projectMap, statsMap, doneColumnId, labelMap, openBlockerCounts);

    const buckets = new Map<string | null, Array<Doc<"tasks">>>();
    buckets.set(null, []);
    for (const column of namedColumns) {
      buckets.set(column._id, []);
    }
    for (const task of tasks) {
      const key = task.columnId ?? null;
      const bucket = buckets.get(key) ?? buckets.get(null)!;
      bucket.push(task);
    }

    const named = namedColumns.map((column) => ({
      columnId: column._id as Id<"boardColumns"> | null,
      name: column.name,
      color: column.color,
      isDone: column.isDone,
      isBacklog: false,
      tasks: sortTasks(buckets.get(column._id)!).map(enrich),
    }));

    const columns = [
      {
        columnId: null as Id<"boardColumns"> | null,
        name: "Backlog",
        color: BACKLOG_COLUMN_COLOR,
        isDone: false,
        isBacklog: true,
        tasks: sortTasks(buckets.get(null)!).map(enrich),
      },
      ...named,
    ];

    return {
      total: columns.reduce((sum, column) => sum + column.tasks.length, 0),
      columns,
    };
  },
});
