import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const projectStatus = v.union(v.literal("active"), v.literal("archived"));

const projectHealth = v.union(
  v.literal("onTrack"),
  v.literal("atRisk"),
  v.literal("offTrack"),
);

const timeBlockOrigin = v.union(v.literal("app"), v.literal("google"));

const syncState = v.union(
  v.literal("synced"),
  v.literal("pending"),
  v.literal("error"),
);

export const apiTokenScope = v.union(
  v.literal("read"),
  v.literal("read_write"),
);

const checklistItem = v.object({
  id: v.string(),
  text: v.string(),
  done: v.boolean(),
});

export const blockReview = v.object({
  outcome: v.union(
    v.literal("done"),
    v.literal("partial"),
    v.literal("missed"),
  ),
  actualMinutes: v.number(),
  focus: v.optional(
    v.union(
      v.literal("deep"),
      v.literal("shallow"),
      v.literal("interrupted"),
    ),
  ),
  note: v.optional(v.string()),
  nextStep: v.optional(v.string()),
  blockedReason: v.optional(v.string()),
  reviewedAt: v.number(),
});

export default defineSchema({
  googleAccounts: defineTable({
    userId: v.string(),
    calendarSyncToken: v.optional(v.string()),
    watchChannelId: v.optional(v.string()),
    watchResourceId: v.optional(v.string()),
    watchExpiry: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  projects: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    status: projectStatus,
    order: v.number(),
    health: v.optional(projectHealth),
    healthNote: v.optional(v.string()),
    goalDate: v.optional(v.string()),
    // Markdown agents read before working on the project (get_project_context).
    // At most AGENT_CONTEXT_MAX_LENGTH characters.
    agentContext: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  tasks: defineTable({
    userId: v.string(),
    title: v.string(),
    notes: v.optional(v.string()),
    checklist: v.optional(v.array(checklistItem)),
    archived: v.optional(v.boolean()),
    projectId: v.optional(v.id("projects")),
    columnId: v.optional(v.id("boardColumns")),
    // Deprecated leftover on existing documents. Do not write. Strip with
    // migrations.clearLegacyTaskStatus, then remove from the schema.
    status: v.optional(
      v.union(
        v.literal("backlog"),
        v.literal("investigate"),
        v.literal("in-progress"),
        v.literal("review"),
        v.literal("test"),
        v.literal("done"),
      ),
    ),
    scheduledDate: v.optional(v.string()),
    estimateMinutes: v.optional(v.number()),
    dueDate: v.optional(v.string()),
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    order: v.number(),
    completedAt: v.optional(v.number()),
    // Labels (epics) on this task, at most 10, all owned by the same user.
    labelIds: v.optional(v.array(v.id("labels"))),
    // Set by the user only: agents may pick this task up. Never set over MCP.
    pullable: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_columnId", ["userId", "columnId"])
    .index("by_user_scheduledDate", ["userId", "scheduledDate"])
    .index("by_project", ["projectId"])
    .index("by_userId_and_order", ["userId", "order"])
    .index("by_userId_and_pullable", ["userId", "pullable"])
    .index("by_userId_and_pullable_and_projectId", ["userId", "pullable", "projectId"]),

  // "taskId is blocked by blockerTaskId". Rules in lib/taskBlockers.ts.
  taskBlockers: defineTable({
    userId: v.string(),
    taskId: v.id("tasks"),
    blockerTaskId: v.id("tasks"),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_blocker", ["blockerTaskId"])
    .index("by_userId", ["userId"]),

  // Operational lease: exactly one row per task, enforced transactionally.
  taskClaims: defineTable({
    userId: v.string(),
    taskId: v.id("tasks"),
    tokenId: v.id("apiTokens"),
    agent: v.string(),
    sessionId: v.string(),
    claimedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_expiresAt", ["expiresAt"]),

  taskHandoffs: defineTable({
    userId: v.string(),
    taskId: v.id("tasks"),
    tokenId: v.id("apiTokens"),
    agent: v.string(),
    sessionId: v.string(),
    summary: v.string(),
    testList: v.array(v.string()),
    nextSteps: v.array(v.string()),
    tester: v.union(v.literal("agent"), v.literal("user")),
    followUpTaskIds: v.array(v.id("tasks")),
    at: v.number(),
  }).index("by_task", ["taskId"]),

  boardColumns: defineTable({
    userId: v.string(),
    name: v.string(),
    color: v.string(),
    order: v.number(),
    isDone: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_order", ["userId", "order"]),

  // Task labels / epics. At most 50 per user, names unique per user.
  labels: defineTable({
    userId: v.string(),
    name: v.string(),
    color: v.string(),
    order: v.number(),
  }).index("by_user", ["userId"]),

  timeBlocks: defineTable({
    userId: v.string(),
    title: v.string(),
    start: v.number(),
    end: v.number(),
    googleEventId: v.optional(v.string()),
    origin: timeBlockOrigin,
    syncState: syncState,
    lastSyncedAt: v.optional(v.number()),
    updatedAt: v.number(),
    // Block-level review, only for blocks without tasks. Blocks with tasks
    // keep their reviews on each timeBlockTasks membership.
    review: v.optional(blockReview),
  })
    .index("by_user", ["userId"])
    .index("by_user_start", ["userId", "start"])
    .index("by_googleEventId", ["googleEventId"])
    .index("by_syncState", ["syncState"]),

  timeBlockTasks: defineTable({
    userId: v.string(),
    blockId: v.id("timeBlocks"),
    taskId: v.id("tasks"),
    order: v.number(),
    review: v.optional(blockReview),
  })
    .index("by_block", ["blockId", "order"])
    .index("by_task", ["taskId"])
    .index("by_user_task", ["userId", "taskId"])
    .index("by_user", ["userId"]),

  dayRecords: defineTable({
    userId: v.string(),
    dateKey: v.string(),
    intention: v.optional(v.string()),
    shutdownCompletedAt: v.optional(v.number()),
    shutdownNote: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user_dateKey", ["userId", "dateKey"]),

  userSettings: defineTable({
    userId: v.string(),
    // IANA zone synced from the browser, e.g. "Europe/Stockholm".
    timezone: v.optional(v.string()),
    // Lets MCP agents move tasks to the done column. Off unless set.
    agentsCanMarkDone: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Personal access tokens for the MCP server (`Authorization: Bearer lp_…`).
  apiTokens: defineTable({
    userId: v.string(),
    name: v.string(),
    // Hex SHA-256 of the full token. The plaintext is never stored.
    tokenHash: v.string(),
    // First 8 characters after "lp_", for display.
    prefix: v.string(),
    scope: apiTokenScope,
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    // Written at most once a minute per token.
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"]),

  // One row per MCP tool call, kept for 30 days.
  mcpActivity: defineTable({
    userId: v.string(),
    tokenId: v.id("apiTokens"),
    tool: v.string(),
    ok: v.boolean(),
    // "Archived 'Write spec'", or the error message.
    summary: v.string(),
    targetIds: v.array(v.string()),
    at: v.number(),
    // Snapshot of the token's name when the call was made.
    agent: v.optional(v.string()),
    // The caller's X-Agent-Session header or `sessionId` argument.
    sessionId: v.optional(v.string()),
  })
    .index("by_tokenId_and_at", ["tokenId", "at"])
    .index("by_at", ["at"]),
});
