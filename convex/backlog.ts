import { query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  buildTaskStatsMap,
  emptyTaskStats,
  isTaskActive,
} from "./lib/taskStats";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const backlogTasks = tasks
      .filter((task) => task.status !== "done")
      .sort((a, b) => a.order - b.order);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projectMap = new Map(projects.map((p) => [p._id, p]));
    const statsMap = await buildTaskStatsMap(ctx, userId);

    const enrich = (task: (typeof backlogTasks)[number]) => {
      const stats = statsMap.get(task._id) ?? emptyTaskStats();
      return {
        ...task,
        project: task.projectId ? projectMap.get(task.projectId) ?? null : null,
        stats,
        active: isTaskActive(task.status, stats),
      };
    };

    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        color: string | null;
        tasks: Array<ReturnType<typeof enrich>>;
      }
    >();

    for (const task of backlogTasks) {
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
      groups.get(key)!.tasks.push(enrich(task));
    }

    return {
      total: backlogTasks.length,
      groups: Array.from(groups.values()),
    };
  },
});
