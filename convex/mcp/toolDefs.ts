import { z } from "zod";
import { MAX_CHECKLIST_ITEMS } from "../lib/checklist";
import { ISO_WITH_OFFSET_HINT, isIsoWithOffset } from "../lib/mcpTime";
import type { NeededScope, TokenScope } from "../lib/mcpAuth";

// The MCP tool catalogue: names, descriptions and input schemas, written once
// in zod. `tools/list` sends them as JSON Schema; `tools/call` validates
// arguments with them. Handlers live in ./handlers.ts.

export type RateBucket = "read" | "write" | "calendar";

const isoTime = z
  .string()
  .refine(isIsoWithOffset, { message: ISO_WITH_OFFSET_HINT })
  .describe(
    "ISO 8601 time with a UTC offset, e.g. 2026-11-04T09:00:00+01:00",
  );

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2026-11-04")
  .describe("Local calendar date, YYYY-MM-DD");

const taskId = z.string().min(1).describe("Task ID from list_tasks");
const blockId = z.string().min(1).describe("Block ID from list_calendar");
const projectId = z.string().min(1).describe("Project ID from list_projects");
const columnId = z
  .string()
  .min(1)
  .describe("Board column ID from list_columns");
const title = z.string().trim().min(1).max(500);
const notes = z.string().max(20_000);
const priority = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .describe("1 = high, 2 = medium, 3 = low");
const estimateMinutes = z.number().int().positive().max(24 * 60);
const checklistInput = z
  .array(
    z.strictObject({
      id: z
        .string()
        .min(1)
        .optional()
        .describe("Keep an existing item's ID; omit for new items"),
      text: z.string().max(500),
      done: z.boolean().optional().describe("Default false"),
    }),
  )
  .max(MAX_CHECKLIST_ITEMS);

export const toolInputs = {
  get_context: z.strictObject({}),
  list_tasks: z.strictObject({
    archived: z
      .boolean()
      .optional()
      .describe("List archived tasks instead of open ones. Default false"),
    projectId: projectId.optional(),
    columnId: columnId.optional(),
    scheduledDate: dateKey.optional(),
    dueBefore: dateKey
      .optional()
      .describe("Only tasks due before this local date"),
    limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
  }),
  get_task: z.strictObject({ taskId }),
  list_projects: z.strictObject({
    includeArchived: z.boolean().optional().describe("Default false"),
  }),
  get_project_context: z.strictObject({ projectId }),
  list_columns: z.strictObject({}),
  list_calendar: z.strictObject({
    start: isoTime,
    end: isoTime.describe("Exclusive. At most 31 days after start"),
  }),
  create_task: z.strictObject({
    title,
    notes: notes.optional(),
    projectId: projectId.optional(),
    columnId: columnId.optional(),
    dueDate: dateKey.optional(),
    estimateMinutes: estimateMinutes.optional(),
    priority: priority.optional(),
    checklist: checklistInput.optional(),
  }),
  update_task: z.strictObject({
    taskId,
    title: title.optional(),
    notes: notes.nullable().optional().describe("null clears the notes"),
    projectId: projectId.nullable().optional().describe("null removes it"),
    columnId: columnId
      .nullable()
      .optional()
      .describe("Move to this board column. The done column completes it"),
    dueDate: dateKey.nullable().optional(),
    estimateMinutes: estimateMinutes.nullable().optional(),
    priority: priority.nullable().optional(),
    checklist: checklistInput
      .optional()
      .describe("Replaces the whole checklist"),
  }),
  archive_task: z.strictObject({ taskId }),
  unarchive_task: z.strictObject({ taskId }),
  create_block: z.strictObject({
    title,
    start: isoTime,
    end: isoTime,
    taskIds: z.array(taskId).max(20).optional(),
  }),
  update_block: z.strictObject({
    blockId,
    title: title.optional(),
    start: isoTime.optional(),
    end: isoTime.optional(),
    taskIds: z
      .array(taskId)
      .max(20)
      .optional()
      .describe("Replaces the block's tasks"),
  }),
  delete_block: z.strictObject({ blockId }),
  schedule_task: z.strictObject({
    taskId,
    start: isoTime,
    end: isoTime.optional(),
    durationMinutes: estimateMinutes
      .optional()
      .describe("Used when end is omitted. Defaults to the task's estimate"),
  }),
} as const;

export type ToolName = keyof typeof toolInputs;
export type ToolInput<T extends ToolName> = z.output<(typeof toolInputs)[T]>;

type ToolMeta = {
  title: string;
  description: string;
  scope: NeededScope;
  buckets: ReadonlyArray<RateBucket>;
  destructive?: boolean;
};

const READ = { scope: "read", buckets: ["read"] } as const;
const WRITE = { scope: "write", buckets: ["write"] } as const;
const CALENDAR_WRITE = {
  scope: "write",
  buckets: ["write", "calendar"],
} as const;

export const toolMeta: Record<ToolName, ToolMeta> = {
  get_context: {
    ...READ,
    title: "Get context",
    description:
      "Current local time, the user's timezone, today's date and the done column ID. Call this first.",
  },
  list_tasks: {
    ...READ,
    title: "List tasks",
    description:
      "The user's tasks in board order, as compact rows. Open tasks unless archived is true.",
  },
  get_task: {
    ...READ,
    title: "Get task",
    description:
      "One task with its notes, checklist and the calendar blocks it is planned in.",
  },
  list_projects: {
    ...READ,
    title: "List projects",
    description:
      "The user's projects, active ones unless includeArchived. hasAgentContext: true means get_project_context has notes for agents.",
  },
  get_project_context: {
    ...READ,
    title: "Get project context",
    description:
      "A project's name, description, health, goal date, open task count and agentContext: the user's markdown notes for agents (repo, conventions, where to find things). Call it before working on a project's tasks.",
  },
  list_columns: {
    ...READ,
    title: "List board columns",
    description:
      "The board columns in order. Moving a task to the isDone column completes it.",
  },
  list_calendar: {
    ...READ,
    title: "List calendar",
    description:
      "Calendar blocks overlapping [start, end), at most 31 days. Blocks with editable: false are the user's Google Calendar events and are read-only.",
  },
  create_task: {
    ...WRITE,
    title: "Create task",
    description: "Creates a task. Without columnId it goes in the backlog.",
  },
  update_task: {
    ...WRITE,
    title: "Update task",
    description:
      "Changes a task's fields. Omitted fields stay as they are; null clears a field. Use archive_task to archive.",
  },
  archive_task: {
    ...WRITE,
    title: "Archive task",
    description:
      "Archives a task. Tasks can't be deleted; archiving hides them and can be undone with unarchive_task.",
  },
  unarchive_task: {
    ...WRITE,
    title: "Unarchive task",
    description: "Restores an archived task.",
  },
  create_block: {
    ...CALENDAR_WRITE,
    title: "Create calendar block",
    description:
      "Adds a time block to the calendar, optionally linked to tasks. It syncs to Google Calendar if connected.",
  },
  update_block: {
    ...CALENDAR_WRITE,
    title: "Update calendar block",
    description:
      "Moves, renames or relinks a block. Only blocks with editable: true can be changed.",
  },
  delete_block: {
    ...CALENDAR_WRITE,
    title: "Delete calendar block",
    description:
      "Removes a block from the calendar and Google Calendar. Its tasks are kept. Only editable blocks.",
    destructive: true,
  },
  schedule_task: {
    ...CALENDAR_WRITE,
    title: "Schedule task",
    description:
      "Plans a task into the calendar as a new block named after it. Give end, or durationMinutes, or neither to use the task's estimate.",
  },
};

export const TOOL_NAMES = Object.keys(toolInputs) as Array<ToolName>;

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(toolInputs, name);
}

export function toolNeedsScope(name: ToolName): NeededScope {
  return toolMeta[name].scope;
}

export function toolsForScope(scope: TokenScope): Array<ToolName> {
  return TOOL_NAMES.filter(
    (name) => toolMeta[name].scope === "read" || scope === "read_write",
  );
}

/** The `tools/list` entries a token with `scope` may call. */
export function listToolsForScope(scope: TokenScope) {
  return toolsForScope(scope).map((name) => {
    const meta = toolMeta[name];
    const inputSchema = z.toJSONSchema(toolInputs[name], {
      io: "input",
      target: "draft-2020-12",
    });
    delete inputSchema.$schema;
    return {
      name,
      title: meta.title,
      description: meta.description,
      inputSchema,
      annotations: {
        title: meta.title,
        readOnlyHint: meta.scope === "read",
        destructiveHint: meta.destructive ?? false,
        idempotentHint: meta.scope === "read",
        openWorldHint: false,
      },
    };
  });
}

/** "start: must be …; title: Required" */
export function formatInputError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
  return `Invalid arguments: ${details}`;
}
