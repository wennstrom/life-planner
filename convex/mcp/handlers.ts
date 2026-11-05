import { listPullableTasksForUser } from "../lib/pullableTasks";
import {
  activeClaimForTask,
  assertAgentMayWriteTaskForUser,
  claimTaskForUser,
  claimView,
  heartbeatClaimForUser,
  releaseClaimForUser,
} from "../lib/taskClaims";
import { completeWorkForUser, latestHandoffForUser } from "../lib/taskHandoffs";
import { assertAgentMayPlaceInColumn } from "../lib/agentGate";
import {
  findColumnByName,
  getDoneColumn,
  isTaskDone,
  listColumnsForUser,
} from "../lib/boardColumns";
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
import {
  dateKeyInZone,
  formatLocal,
  parseIsoWithOffset,
  weekdayInZone,
} from "../lib/mcpTime";
import {
  getOwnedLabelForUser,
  labelsForTask,
  listLabelsForUser,
  taskHasLabel,
} from "../lib/labels";
import {
  getProjectContextForUser,
  listProjectsForUser,
} from "../lib/projectOps";
import {
  createTaskForUser,
  getOwnedTaskForUser,
  listTasksForUser,
  updateTaskForUser,
} from "../lib/taskOps";
import {
  addBlockerForUser,
  listBlockersForTask,
  removeBlockerForUser,
} from "../lib/taskBlockers";
import {
  attachBlockViews,
  membershipsForBlock,
} from "../lib/timeBlockMemberships";
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

/** The agent making a tool call: its token and the session it sent. */
export type ToolCaller = {
  tokenId: Id<"apiTokens">;
  /** The token's name, e.g. "Claude Code laptop". */
  agent: string;
  /** X-Agent-Session header, or the tool's `sessionId` argument. */
  sessionId: string | undefined;
};

export type ToolUser = {
  userId: string;
  /** IANA zone, or null if the user hasn't opened the app since it was added. */
  timezone: string | null;
  /** userSettings.agentsCanMarkDone; false unless the user turned it on. */
  agentsCanMarkDone: boolean;
  caller: ToolCaller;
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
const labelIdOf = (ctx: MutationCtx, raw: string) =>
  idOrNotFound(ctx, "labels", raw, "Label not found");

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
    pullable: task.pullable === true,
    priority: task.priority ?? null,
    dueDate: task.dueDate ?? null,
    scheduledDate: task.scheduledDate ?? null,
    estimateMinutes: task.estimateMinutes ?? null,
    labelIds: task.labelIds ?? [],
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

/** Check existing and replacement memberships, including pure time/title edits. */
async function guardTasks(
  ctx: MutationCtx,
  user: ToolUser,
  taskIds: Array<Id<"tasks">>,
) {
  const now = Date.now();
  for (const taskId of new Set(taskIds))
    await assertAgentMayWriteTaskForUser(
      ctx,
      user.userId,
      taskId,
      user.caller,
      now,
    );
}

const listPullableTasks: Handler<"list_pullable_tasks"> = async (
  ctx,
  user,
  input,
) => {
  const result = await listPullableTasksForUser(
    ctx,
    user.userId,
    {
      projectId:
        input.projectId === undefined
          ? undefined
          : await ownedProjectId(ctx, user.userId, input.projectId),
      labelId:
        input.labelId === undefined ? undefined : labelIdOf(ctx, input.labelId),
      limit: input.limit,
    },
    Date.now(),
  );
  return {
    result,
    summary: `Listed ${result.tasks.length} pullable tasks`,
    targetIds: [],
  };
};
const claimTask: Handler<"claim_task"> = async (ctx, user, input) => {
  const taskId = taskIdOf(ctx, input.taskId);
  const claim = await claimTaskForUser(ctx, user.userId, user.caller, {
    taskId,
    leaseMinutes: input.leaseMinutes,
    agentsCanMarkDone: user.agentsCanMarkDone,
  });
  return {
    result: { taskId, claim },
    summary: "Claimed task",
    targetIds: [taskId],
  };
};
const heartbeatClaim: Handler<"heartbeat_claim"> = async (ctx, user, input) => {
  const taskId = taskIdOf(ctx, input.taskId);
  const claim = await heartbeatClaimForUser(ctx, user.userId, user.caller, {
    taskId,
    leaseMinutes: input.leaseMinutes,
  });
  return {
    result: { taskId, claim },
    summary: "Renewed task claim",
    targetIds: [taskId],
  };
};
const releaseClaim: Handler<"release_claim"> = async (ctx, user, input) => {
  const taskId = taskIdOf(ctx, input.taskId);
  await releaseClaimForUser(ctx, user.userId, user.caller, taskId);
  return {
    result: { taskId, released: true },
    summary: "Released task claim",
    targetIds: [taskId],
  };
};
const completeWork: Handler<"complete_work"> = async (ctx, user, input) => {
  const taskId = taskIdOf(ctx, input.taskId);
  const result = await completeWorkForUser(
    ctx,
    user.userId,
    user.caller,
    { ...input, taskId },
    user.agentsCanMarkDone,
  );
  return {
    result: { taskId, ...result },
    summary: "Handed work to Test",
    targetIds: [taskId, result.handoffId, ...result.followUpTaskIds],
  };
};

// --- read tools ------------------------------------------------------------

const getContext: Handler<"get_context"> = async (ctx, user) => {
  if (user.timezone === null) throw new Error(NO_TIMEZONE_ERROR);
  const now = Date.now();
  const done = await getDoneColumn(ctx, user.userId);
  const test = await findColumnByName(ctx, user.userId, "test");
  const review = await findColumnByName(ctx, user.userId, "review");
  return {
    result: {
      now: formatLocal(now, user.timezone),
      timezone: user.timezone,
      today: dateKeyInZone(now, user.timezone),
      weekday: weekdayInZone(now, user.timezone),
      doneColumnId: done?._id ?? null,
      testColumnId: test?._id ?? null,
      reviewColumnId: review?._id ?? null,
      agentsCanMarkDone: user.agentsCanMarkDone,
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
  const labelId =
    input.labelId !== undefined
      ? (
          await getOwnedLabelForUser(
            ctx,
            user.userId,
            labelIdOf(ctx, input.labelId),
          )
        )._id
      : undefined;
  const matching = tasks.filter(
    (task) =>
      (labelId === undefined || taskHasLabel(task, labelId)) &&
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
  const labels = await labelsForTask(ctx, task);
  const { blockedBy, blocking } = await listBlockersForTask(
    ctx,
    user.userId,
    task._id,
  );
  return {
    result: {
      task: {
        ...row,
        claim: claimView(await activeClaimForTask(ctx, task._id, Date.now())),
        latestHandoff: await latestHandoffForUser(ctx, user.userId, task._id),
        projectName: project?.name ?? null,
        columnName: column?.name ?? null,
        labels: labels.map((label) => ({ id: label._id, name: label.name })),
        notes: task.notes ?? null,
        checklist: task.checklist ?? [],
        completedAt:
          task.completedAt !== undefined
            ? formatLocal(task.completedAt, timezone)
            : null,
        createdAt: formatLocal(task._creationTime, timezone),
        blocks: blocks.map((block) => blockRow(block, timezone)),
        blockedBy: blockedBy.map((blocker) => ({
          id: blocker.taskId,
          title: blocker.title,
          open: blocker.open,
        })),
        blocking: blocking.map((blocked) => ({
          id: blocked.taskId,
          title: blocked.title,
        })),
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
        hasAgentContext: project.agentContext !== undefined,
      })),
    },
    summary: `Listed ${projects.length} project${projects.length === 1 ? "" : "s"}`,
    targetIds: [],
  };
};

const getProjectContext: Handler<"get_project_context"> = async (
  ctx,
  user,
  input,
) => {
  const { project, openTaskCount, openTaskCountCapped } =
    await getProjectContextForUser(
      ctx,
      user.userId,
      idOrNotFound(ctx, "projects", input.projectId, "Project not found"),
    );
  return {
    result: {
      project: {
        id: project._id,
        name: project.name,
        description: project.description ?? null,
        status: project.status,
        agentContext: project.agentContext ?? null,
        health: project.health ?? null,
        healthNote: project.healthNote ?? null,
        goalDate: project.goalDate ?? null,
        openTaskCount,
        openTaskCountCapped,
      },
    },
    summary: `Read context for ${quoted(project.name)}`,
    targetIds: [project._id],
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
  const columnId =
    input.columnId !== undefined
      ? await ownedColumnId(ctx, user.userId, input.columnId)
      : undefined;
  await assertAgentMayPlaceInColumn(ctx, user.userId, {
    agentsCanMarkDone: user.agentsCanMarkDone,
    targetColumnId: columnId,
  });
  const taskId = await createTaskForUser(ctx, user.userId, {
    title: input.title,
    notes: input.notes,
    projectId:
      input.projectId !== undefined
        ? await ownedProjectId(ctx, user.userId, input.projectId)
        : undefined,
    columnId,
    dueDate: input.dueDate,
    estimateMinutes: input.estimateMinutes,
    priority: input.priority,
    checklist:
      input.checklist !== undefined
        ? checklistFromInput(input.checklist)
        : undefined,
    labelIds: input.labelIds?.map((id) => labelIdOf(ctx, id)),
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
  await assertAgentMayWriteTaskForUser(
    ctx,
    user.userId,
    taskId,
    user.caller,
    Date.now(),
  );
  const current = await getOwnedTaskForUser(ctx, user.userId, taskId);
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
    await assertAgentMayPlaceInColumn(ctx, user.userId, {
      agentsCanMarkDone: user.agentsCanMarkDone,
      targetColumnId: args.columnId,
      currentColumnId: current.columnId,
    });
  }
  if (input.checklist !== undefined) {
    args.checklist = checklistFromInput(input.checklist);
  }
  if (input.labelIds !== undefined) {
    args.labelIds = input.labelIds.map((id) => labelIdOf(ctx, id));
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
    await assertAgentMayWriteTaskForUser(
      ctx,
      user.userId,
      taskId,
      user.caller,
      Date.now(),
    );
    await updateTaskForUser(ctx, user.userId, { taskId, archived });
    const { task, row } = await taskResult(ctx, user.userId, taskId);
    return {
      result: { task: row },
      summary: `${archived ? "Archived" : "Unarchived"} ${quoted(task.title)}`,
      targetIds: [taskId],
    };
  };
}

// --- blockers ----------------------------------------------------------------

/** The two tasks named by a blocker tool, both checked to be the user's. */
async function blockerPair(
  ctx: MutationCtx,
  userId: string,
  input: { taskId: string; blockerTaskId: string },
) {
  const task = await getOwnedTaskForUser(
    ctx,
    userId,
    taskIdOf(ctx, input.taskId),
  );
  const blockerId = idOrNotFound(
    ctx,
    "tasks",
    input.blockerTaskId,
    "Blocker task not found",
  );
  const blocker = await ctx.db.get("tasks", blockerId);
  if (!blocker || blocker.userId !== userId) {
    throw new Error("Blocker task not found");
  }
  return { task, blocker };
}

const addBlockedBy: Handler<"add_blocked_by"> = async (ctx, user, input) => {
  const { task, blocker } = await blockerPair(ctx, user.userId, input);
  await guardTasks(ctx, user, [task._id, blocker._id]);
  await addBlockerForUser(ctx, user.userId, {
    taskId: task._id,
    blockerTaskId: blocker._id,
  });
  const { blockedBy } = await listBlockersForTask(ctx, user.userId, task._id);
  return {
    result: {
      taskId: task._id,
      blockedBy: blockedBy.map((row) => ({
        id: row.taskId,
        title: row.title,
        open: row.open,
      })),
    },
    summary: `${quoted(task.title)} is now blocked by ${quoted(blocker.title)}`,
    targetIds: [task._id, blocker._id],
  };
};

const removeBlockedBy: Handler<"remove_blocked_by"> = async (
  ctx,
  user,
  input,
) => {
  const { task, blocker } = await blockerPair(ctx, user.userId, input);
  await guardTasks(ctx, user, [task._id, blocker._id]);
  const removed = await removeBlockerForUser(ctx, user.userId, {
    taskId: task._id,
    blockerTaskId: blocker._id,
  });
  if (!removed) {
    throw new Error(
      `${quoted(task.title)} isn't blocked by ${quoted(blocker.title)}`,
    );
  }
  return {
    result: { taskId: task._id, removedBlockerTaskId: blocker._id },
    summary: `${quoted(task.title)} is no longer blocked by ${quoted(blocker.title)}`,
    targetIds: [task._id, blocker._id],
  };
};

// --- calendar writes -----------------------------------------------------------

const createBlock: Handler<"create_block"> = async (ctx, user, input) => {
  const start = parseIsoWithOffset(input.start, "start");
  const end = parseIsoWithOffset(input.end, "end");
  assertEndAfterStart(start, end);
  await guardTasks(
    ctx,
    user,
    input.taskIds?.map((id) => taskIdOf(ctx, id)) ?? [],
  );
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
  const existingTaskIds = (await membershipsForBlock(ctx, block._id)).map(
    (row) => row.taskId,
  );
  await guardTasks(ctx, user, existingTaskIds);
  const start =
    input.start !== undefined
      ? parseIsoWithOffset(input.start, "start")
      : undefined;
  const end =
    input.end !== undefined ? parseIsoWithOffset(input.end, "end") : undefined;
  assertEndAfterStart(start ?? block.start, end ?? block.end);
  const replacementTaskIds = input.taskIds?.map((id) => taskIdOf(ctx, id));
  await guardTasks(ctx, user, replacementTaskIds ?? []);
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
    targetIds: [
      block._id,
      ...new Set([...existingTaskIds, ...(replacementTaskIds ?? [])]),
    ],
  };
};

const deleteBlock: Handler<"delete_block"> = async (ctx, user, input) => {
  const block = await editableBlock(ctx, user.userId, input.blockId);
  const existingTaskIds = (await membershipsForBlock(ctx, block._id)).map(
    (row) => row.taskId,
  );
  await guardTasks(ctx, user, existingTaskIds);
  await removeBlockForUser(ctx, user.userId, { blockId: block._id });
  return {
    result: { deleted: block._id },
    summary: `Deleted block ${quoted(block.title)}`,
    targetIds: [block._id, ...existingTaskIds],
  };
};

const scheduleTask: Handler<"schedule_task"> = async (ctx, user, input) => {
  const taskId = taskIdOf(ctx, input.taskId);
  const task = await getOwnedTaskForUser(ctx, user.userId, taskId);
  await guardTasks(ctx, user, [taskId]);
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

// --- labels ------------------------------------------------------------------

const listLabels: Handler<"list_labels"> = async (ctx, user) => {
  const labels = await listLabelsForUser(ctx, user.userId);
  return {
    result: {
      labels: labels.map((label) => ({
        id: label._id,
        name: label.name,
        color: label.color,
      })),
    },
    summary: `Listed ${labels.length} label${labels.length === 1 ? "" : "s"}`,
    targetIds: [],
  };
};

export const handlers: { [T in ToolName]: Handler<T> } = {
  list_pullable_tasks: listPullableTasks,
  claim_task: claimTask,
  heartbeat_claim: heartbeatClaim,
  release_claim: releaseClaim,
  complete_work: completeWork,
  get_context: getContext,
  list_tasks: listTasks,
  get_task: getTask,
  list_projects: listProjects,
  get_project_context: getProjectContext,
  list_columns: listColumns,
  list_calendar: listCalendar,
  create_task: createTask,
  update_task: updateTask,
  archive_task: setArchived(true),
  unarchive_task: setArchived(false),
  add_blocked_by: addBlockedBy,
  remove_blocked_by: removeBlockedBy,
  create_block: createBlock,
  update_block: updateBlock,
  delete_block: deleteBlock,
  schedule_task: scheduleTask,
  list_labels: listLabels,
};
