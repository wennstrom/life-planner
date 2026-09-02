import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { isTaskArchived } from "./lib/checklist";
import { isTaskDone, listColumnsForUser } from "./lib/boardColumns";
import {
  buildTaskStatsMap,
  emptyTaskStats,
  isTaskActive,
  type TaskStats,
} from "./lib/taskStats";
import type { Doc, Id } from "./_generated/dataModel";

function enrichTask(
  task: Doc<"tasks">,
  projectMap: Map<Id<"projects">, Doc<"projects">>,
  statsMap: Map<Id<"tasks">, TaskStats>,
  doneColumnId: Id<"boardColumns"> | undefined,
) {
  const stats = statsMap.get(task._id) ?? emptyTaskStats();
  const isDone = isTaskDone(task.columnId, doneColumnId);
  return {
    ...task,
    project: task.projectId ? (projectMap.get(task.projectId) ?? null) : null,
    stats,
    isDone,
    active: isTaskActive(isDone, stats),
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

    const tasks = sortTasks(
      (
        await ctx.db
          .query("tasks")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      ).filter((task) => isTaskArchived(task) === archived),
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
        .tasks.push(enrichTask(task, projectMap, statsMap, done?._id));
    }

    return {
      total: tasks.length,
      groups: Array.from(groups.values()),
    };
  },
});

export const board = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const namedColumns = await listColumnsForUser(ctx, userId);
    const tasks = (
      await ctx.db
        .query("tasks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).filter((task) => !isTaskArchived(task));
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projectMap = new Map(projects.map((p) => [p._id, p]));
    const statsMap = await buildTaskStatsMap(ctx, userId);
    const doneColumnId = namedColumns.find((column) => column.isDone)?._id;

    const enrich = (task: Doc<"tasks">) =>
      enrichTask(task, projectMap, statsMap, doneColumnId);

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

    const columns = [
      {
        columnId: null as Id<"boardColumns"> | null,
        name: "Backlog",
        color: null as string | null,
        isDone: false,
        isBacklog: true,
        tasks: sortTasks(buckets.get(null)!).map(enrich),
      },
      ...namedColumns.map((column) => ({
        columnId: column._id,
        name: column.name,
        color: column.color,
        isDone: column.isDone,
        isBacklog: false,
        tasks: sortTasks(buckets.get(column._id)!).map(enrich),
      })),
    ];

    return {
      total: columns.reduce((sum, column) => sum + column.tasks.length, 0),
      columns,
    };
  },
});
