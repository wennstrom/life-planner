import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type MembershipView = {
  _id: Id<"timeBlockTasks">;
  taskId: Id<"tasks">;
  order: number;
  taskTitle: string;
  review?: Doc<"timeBlockTasks">["review"];
};

export type TimeBlockView = Doc<"timeBlocks"> & {
  memberships: MembershipView[];
};

export async function requireOwnedTasks(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  taskIds: Id<"tasks">[],
) {
  const unique = new Set(taskIds.map(String));
  if (unique.size !== taskIds.length) {
    throw new Error("Duplicate task");
  }
  for (const taskId of taskIds) {
    const task = await ctx.db.get("tasks", taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }
  }
}

export async function membershipsForBlock(
  ctx: QueryCtx | MutationCtx,
  blockId: Id<"timeBlocks">,
) {
  const rows = await ctx.db
    .query("timeBlockTasks")
    .withIndex("by_block", (q) => q.eq("blockId", blockId))
    .collect();
  return rows.sort((a, b) => a.order - b.order);
}

export async function replaceMemberships(
  ctx: MutationCtx,
  args: {
    userId: string;
    blockId: Id<"timeBlocks">;
    taskIds: Id<"tasks">[];
  },
) {
  await requireOwnedTasks(ctx, args.userId, args.taskIds);
  const existing = await membershipsForBlock(ctx, args.blockId);
  const byTask = new Map(existing.map((row) => [row.taskId, row]));
  const keep = new Set(args.taskIds);

  for (const row of existing) {
    if (!keep.has(row.taskId)) {
      await ctx.db.delete("timeBlockTasks", row._id);
    }
  }

  for (let order = 0; order < args.taskIds.length; order++) {
    const taskId = args.taskIds[order];
    const current = byTask.get(taskId);
    if (current && keep.has(taskId)) {
      await ctx.db.patch("timeBlockTasks", current._id, { order });
    } else if (!current) {
      await ctx.db.insert("timeBlockTasks", {
        userId: args.userId,
        blockId: args.blockId,
        taskId,
        order,
      });
    }
  }
}

export async function deleteMembershipsForBlock(
  ctx: MutationCtx,
  blockId: Id<"timeBlocks">,
) {
  const rows = await membershipsForBlock(ctx, blockId);
  for (const row of rows) {
    await ctx.db.delete("timeBlockTasks", row._id);
  }
}

export async function deleteMembershipsForTask(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<Id<"timeBlocks">[]> {
  const rows = await ctx.db
    .query("timeBlockTasks")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  const blockIds = [...new Set(rows.map((r) => r.blockId))];
  for (const row of rows) {
    await ctx.db.delete("timeBlockTasks", row._id);
  }
  return blockIds;
}

export async function attachBlockViews(
  ctx: QueryCtx,
  blocks: Doc<"timeBlocks">[],
): Promise<TimeBlockView[]> {
  const views: TimeBlockView[] = [];
  for (const block of blocks) {
    const rows = await membershipsForBlock(ctx, block._id);
    const memberships: MembershipView[] = [];
    for (const row of rows) {
      const task = await ctx.db.get("tasks", row.taskId);
      memberships.push({
        _id: row._id,
        taskId: row.taskId,
        order: row.order,
        taskTitle: task?.title ?? "Untitled",
        review: row.review,
      });
    }
    views.push({ ...block, memberships });
  }
  return views;
}
