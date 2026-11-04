import { getDoneColumn, isTaskDone, listColumnsForUser } from "../lib/boardColumns";
import {
  createBlockForUser,
  createBlockFromTaskForUser,
  getOwnedBlockForUser,
  listBlocksForTaskForUser,
  listBlocksForUser,
  removeBlockForUser,
  updateBlockForUser,
} from "../lib/blockOps";
import { DAY_MS } from "../lib/dates";
import { dateKeyInZone, formatLocal, parseIsoWithOffset, weekdayInZone } from "../lib/mcpTime";
import { listProjectsForUser } from "../lib/projectOps";
import {
  createTaskForUser,
  getOwnedTaskForUser,
  listTasksForUser,
  updateTaskForUser,
} from "../lib/taskOps";
import { attachBlockViews } from "../lib/timeBlockMemberships";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { UpdateTaskArgs } from "../lib/taskOps";
import type { TimeBlockView } from "../lib/timeBlockMemberships";
import type { ToolInput, ToolName } from "./toolDefs";

export const DEFAULT_TASK_LIMIT = 50;
export const MAX_CALENDAR_RANGE_MS = 31 * DAY_MS;
export const READ_ONLY_BLOCK_ERROR =
  "This is an imported Google Calendar event and is read-only";
export const NO_TIMEZONE_ERROR =
  "No timezone is stored for this user yet. Ask them to open Life Planner in a browser once, then try again.";

export type ToolUser = {
  userId: string;
  /** IANA zone, or null if the user hasn't opened the app since it was added. */
  timezone: string | null;
};

export type ToolOutput = {
  result: Record<string, unknown>;
  /** One line for the activity log. */
  summary: string;
  targetIds: Array<string>;
};

type Handler<T extends ToolName> = (
  ctx: MutationCtx,
  user: ToolUser,
  input: ToolInput<T>,
) => Promise<ToolOutput>;

// --- helpers ---------------------------------------------------------------

function zoneOf(user: ToolUser): string {
  return user.timezone ?? "UTC";
}

function quoted(title: string): string {
  const short = title.length > 60 ? `${title.slice(0, 57)}…` : title;
  return `'${short}'`;
}

/** Converts an agent-supplied ID, treating malformed ones as not found. */
function idOrNotFound<T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  raw: string,
  notFound: string,
): Id<T> {
  const id = ctx.db.normalizeId(table, raw);
  if (id === null) throw new Error(notFound);
  return id;
}

const taskIdOf = (ctx: MutationCtx, raw: string) =>
  idOrNotFound(ctx, "tasks", raw, "Task not found");
const blockIdOf = (ctx: MutationCtx, raw: string) =>
  idOrNotFound(ctx, "timeBlocks", raw, "Time block not found");

async function ownedProjectId(
  ctx: MutationCtx,
  userId: string,
  raw: string,
): Promise<Id<"projects">> {
  const id = idOrNotFound(ctx, "projects", raw, "Project not found");
  const project = await ctx.db.get("projects", id);
  if (!project || project.userId !== userId) {
    throw new Error("Project not found");
  }
  return id;
}

async function ownedColumnId(
  ctx: MutationCtx,
  userId: string,
  raw: string,
): Promise<Id<"boardColumns">> {
  const id = idOrNotFound(ctx, "boardColumns", raw, "Column not found");
  const column = await ctx.db.get("boardColumns", id);
  if (!column || column.userId !== userId) {
    throw new Error("Column not found");
  }
  return id;
}

function newChecklistId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function checklistFromInput(
  items: Array<{ id?: string; text: string; done?: boolean }>,
) {
  return items.map((item) => ({
    id: item.id ?? newChecklistId(),
    text: item.text,
    done: item.done ?? false,
  }));
}

function taskRow(
  task: Doc<"tasks">,
  doneColumnId: Id<"boardColumns"> | undefined,
) {
  const checklist = task.checklist ?? [];
  return {
    id: task._id,
    title: task.title,
    projectId: task.projectId ?? null,
    columnId: task.columnId ?? null,
    done: isTaskDone(task.columnId, doneColumnId),
    archived: task.archived === true,
    priority: task.priority ?? null,
    dueDate: task.dueDate ?? null,
    scheduledDate: task.scheduledDate ?? null,
    estimateMinutes: task.estimateMinutes ?? null,
    checklist:
      checklist.length > 0
        ? {
            done: checklist.filter((item) => item.done).length,
            total: checklist.length,
          }
        : null,
  };
}

function blockRow(block: TimeBlockView, timezone: string) {
  return {
    id: block._id,
    title: block.title,
    start: formatLocal(block.start, timezone),
    end: formatLocal(block.end, timezone),
    editable: block.origin === "app",
    origin: block.origin,
    syncState: block.syncState,
    taskIds: block.memberships.map((membership) => membership.taskId),
  };
}

async function blockView(
  ctx: MutationCtx,
  blockId: Id<"timeBlocks">,
): Promise<TimeBlockView> {
  const block = await ctx.db.get("timeBlocks", blockId);
  if (!block) throw new Error("Time block not found");
  const [view] = await attachBlockViews(ctx, [block]);
  return view;
}

async function taskResult(
  ctx: MutationCtx,
  userId: string,
  taskId: Id<"tasks">,
) {
  const task = await getOwnedTaskForUser(ctx, userId, taskId);
  const done = await getDoneColumn(ctx, userId);
  return { task, row: taskRow(task, done?._id) };
}

/** An editable (app-origin) block owned by the user. */
async function editableBlock(
  ctx: MutationCtx,
  userId: string,
  raw: string,
): Promise<Doc<"timeBlocks">> {
  const block = await getOwnedBlockForUser(ctx, userId, blockIdOf(ctx, raw));
  if (block.origin !== "app") throw new Error(READ_ONLY_BLOCK_ERROR);
  return block;
}

function assertEndAfterStart(start: number, end: number) {
  if (end <= start) throw new Error("end must be after start");
}

// --- read tools ------------------------------------------------------------

const getContext: Handler<"get_context"> = async (ctx, user) => {
  if (user.timezone === null) throw new Error(NO_TIMEZONE_ERROR);
  const now = Date.now();
  const done = await getDoneColumn(ctx, user.userId);
  return {
    result: {
      now: formatLocal(now, user.timezone),
      timezone: user.timezone,
      today: dateKeyInZone(now, user.timezone),
      weekday: weekdayInZone(now, user.timezone),
      doneColumnId: done?._id ?? null,
    },
    summary: "Read context",
    targetIds: [],
  };
};

const listTasks: Handler<"list_tasks"> = async (ctx, user, input) => {
  const tasks = await listTasksForUser(ctx, user.userId, {
    archived: input.archived,
  });
  const done = await getDoneColumn(ctx, user.userId);
  const matching = tasks.filter(
    (task) =>
      (input.projectId === undefined || task.projectId === input.projectId) &&
      (input.columnId === undefined || task.columnId === input.columnId) &&
      (input.scheduledDate === undefined ||
        task.scheduledDate === input.scheduledDate) &&
      (input.dueBefore === undefined ||
        (task.dueDate !== undefined && task.dueDate < input.dueBefore)),
  );
  const limit = input.limit ?? DEFAULT_TASK_LIMIT;
  const rows = matching.slice(0, limit).map((task) => taskRow(task, done?._id));
  return {
    result: {
      tasks: rows,
      total: matching.length,
      truncated: matching.length > rows.length,
    },
    summary: `Listed ${rows.length} task${rows.length === 1 ? "" : "s"}`,
    targetIds: [],
  };
};

const getTask: Handler<"get_task"> = async (ctx, user, input) => {
  const timezone = zoneOf(user);
  const { task, row } = await taskResult(
    ctx,
    user.userId,
    taskIdOf(ctx, input.taskId),
  );
  const blocks = await listBlocksForTaskForUser(ctx, user.userId, task._id);
  const project = task.projectId
    ? await ctx.db.get("projects", task.projectId)
    : null;
  const column = task.columnId
    ? await ctx.db.get("boardColumns", task.columnId)
    : null;
  return {
    result: {
      task: {
        ...row,
        projectName: project?.name ?? null,
        columnName: column?.name ?? null,
        notes: task.notes ?? null,
        checklist: task.checklist ?? [],
        completedAt:
          task.completedAt !== undefined
            ? formatLocal(task.completedAt, timezone)
            : null,
        createdAt: formatLocal(task._creationTime, timezone),
        blocks: blocks.map((block) => blockRow(block, timezone)),
      },
    },
    summary: `Read ${quoted(task.title)}`,
    targetIds: [task._id],
  };
};

const listProjects: Handler<"list_projects"> = async (ctx, user, input) => {
  const projects = [
    ...(await listProjectsForUser(ctx, user.userId, { status: "active" })),
    ...(input.includeArchived
      ? await listProjectsForUser(ctx, user.userId, { status: "archived" })
      : []),
  ];
  return {
    result: {
      projects: projects.map((project) => ({
        id: project._id,
        name: project.name,
        description: project.description ?? null,
        status: project.status,
        health: project.health ?? null,
        goalDate: project.goalDate ?? null,
      })),
    },
    summary: `Listed ${projects.length} project${projects.length === 1 ? "" : "s"}`,
    targetIds: [],
  };
};

const listColumns: Handler<"list_columns"> = async (ctx, user) => {
  const columns = await listColumnsForUser(ctx, user.userId);
  return {
    result: {
      columns: columns.map((column, index) => ({
        id: column._id,
        name: column.name,
        order: index,
        isDone: column.isDone,
      })),
    },
    summary: `Listed ${columns.length} column${columns.length === 1 ? "" : "s"}`,
    targetIds: [],
  };
};

const listCalendar: Handler<"list_calendar"> = async (ctx, user, input) => {
  const startMs = parseIsoWithOffset(input.start, "start");
  const endMs = parseIsoWithOffset(input.end, "end");
  assertEndAfterStart(startMs, endMs);
  if (endMs - startMs > MAX_CALENDAR_RANGE_MS) {
    throw new Error("The range can be at most 31 days");
  }
  const blocks = await listBlocksForUser(ctx, user.userId, { startMs, endMs });
  const timezone = zoneOf(user);
  return {
    result: {
      timezone,
      blocks: blocks.map((block) => blockRow(block, timezone)),
    },
    summary: `Listed ${blocks.length} block${blocks.length === 1 ? "" : "s"}`,
    targetIds: [],
  };
};

// --- task writes -------------------------------------------------------------

const createTask: Handler<"create_task"> = async (ctx, user, input) => {
  const taskId = await createTaskForUser(ctx, user.userId, {
    title: input.title,
    notes: input.notes,
    projectId:
      input.projectId !== undefined
        ? await ownedProjectId(ctx, user.userId, input.projectId)
        : undefined,
    columnId:
      input.columnId !== undefined
        ? await ownedColumnId(ctx, user.userId, input.columnId)
        : undefined,
    dueDate: input.dueDate,
    estimateMinutes: input.estimateMinutes,
    priority: input.priority,
    checklist:
      input.checklist !== undefined
        ? checklistFromInput(input.checklist)
        : undefined,
  });
  const { task, row } = await taskResult(ctx, user.userId, taskId);
  return {
    result: { task: row },
    summary: `Created ${quoted(task.title)}`,
    targetIds: [taskId],
  };
};

const updateTask: Handler<"update_task"> = async (ctx, user, input) => {
  const taskId = taskIdOf(ctx, input.taskId);
  await getOwnedTaskForUser(ctx, user.userId, taskId);
  const args: UpdateTaskArgs = {
    taskId,
    title: input.title,
    notes: input.notes,
    dueDate: input.dueDate,
    estimateMinutes: input.estimateMinutes,
    priority: input.priority,
  };
  if (input.projectId !== undefined) {
    args.projectId =
      input.projectId === null
        ? null
        : await ownedProjectId(ctx, user.userId, input.projectId);
  }
  if (input.columnId !== undefined) {
    args.columnId =
      input.columnId === null
        ? null
        : await ownedColumnId(ctx, user.userId, input.columnId);
  }
  if (input.checklist !== undefined) {
    args.checklist = checklistFromInput(input.checklist);
  }
  await updateTaskForUser(ctx, user.userId, args);
  const { task, row } = await taskResult(ctx, user.userId, taskId);
  return {
    result: { task: row },
    summary: `Updated ${quoted(task.title)}`,
    targetIds: [taskId],
  };
};

function setArchived(
  archived: boolean,
): Handler<"archive_task" | "unarchive_task"> {
  return async (ctx, user, input) => {
    const taskId = taskIdOf(ctx, input.taskId);
    await updateTaskForUser(ctx, user.userId, { taskId, archived });
    const { task, row } = await taskResult(ctx, user.userId, taskId);
    return {
      result: { task: row },
      summary: `${archived ? "Archived" : "Unarchived"} ${quoted(task.title)}`,
      targetIds: [taskId],
    };
  };
}

// --- calendar writes -----------------------------------------------------------

const createBlock: Handler<"create_block"> = async (ctx, user, input) => {
  const start = parseIsoWithOffset(input.start, "start");
  const end = parseIsoWithOffset(input.end, "end");
  assertEndAfterStart(start, end);
  const blockId = await createBlockForUser(ctx, user.userId, {
    title: input.title,
    start,
    end,
    taskIds: input.taskIds?.map((id) => taskIdOf(ctx, id)),
  });
  const timezone = zoneOf(user);
  const row = blockRow(await blockView(ctx, blockId), timezone);
  return {
    result: { block: row },
    summary: `Created block ${quoted(input.title)} at ${row.start}`,
    targetIds: [blockId, ...row.taskIds],
  };
};

const updateBlock: Handler<"update_block"> = async (ctx, user, input) => {
  const block = await editableBlock(ctx, user.userId, input.blockId);
  const start =
    input.start !== undefined
      ? parseIsoWithOffset(input.start, "start")
      : undefined;
  const end =
    input.end !== undefined ? parseIsoWithOffset(input.end, "end") : undefined;
  assertEndAfterStart(start ?? block.start, end ?? block.end);
  await updateBlockForUser(ctx, user.userId, {
    blockId: block._id,
    title: input.title,
    start,
    end,
    taskIds: input.taskIds?.map((id) => taskIdOf(ctx, id)),
  });
  const row = blockRow(await blockView(ctx, block._id), zoneOf(user));
  return {
    result: { block: row },
    summary: `Updated block ${quoted(row.title)}`,
    targetIds: [block._id],
  };
};

const deleteBlock: Handler<"delete_block"> = async (ctx, user, input) => {
  const block = await editableBlock(ctx, user.userId, input.blockId);
  await removeBlockForUser(ctx, user.userId, { blockId: block._id });
  return {
    result: { deleted: block._id },
    summary: `Deleted block ${quoted(block.title)}`,
    targetIds: [block._id],
  };
};

const scheduleTask: Handler<"schedule_task"> = async (ctx, user, input) => {
  const taskId = taskIdOf(ctx, input.taskId);
  const task = await getOwnedTaskForUser(ctx, user.userId, taskId);
  const start = parseIsoWithOffset(input.start, "start");
  let end: number;
  if (input.end !== undefined) {
    end = parseIsoWithOffset(input.end, "end");
  } else {
    const minutes = input.durationMinutes ?? task.estimateMinutes;
    if (minutes === undefined) {
      throw new Error(
        "Give end or durationMinutes: this task has no time estimate",
      );
    }
    end = start + minutes * 60_000;
  }
  assertEndAfterStart(start, end);
  const blockId = await createBlockFromTaskForUser(ctx, user.userId, {
    taskId,
    start,
    end,
  });
  const row = blockRow(await blockView(ctx, blockId), zoneOf(user));
  return {
    result: { block: row },
    summary: `Scheduled ${quoted(task.title)} at ${row.start}`,
    targetIds: [taskId, blockId],
  };
};

export const handlers: { [T in ToolName]: Handler<T> } = {
  get_context: getContext,
  list_tasks: listTasks,
  get_task: getTask,
  list_projects: listProjects,
  list_columns: listColumns,
  list_calendar: listCalendar,
  create_task: createTask,
  update_task: updateTask,
  archive_task: setArchived(true),
  unarchive_task: setArchived(false),
  create_block: createBlock,
  update_block: updateBlock,
  delete_block: deleteBlock,
  schedule_task: scheduleTask,
};
