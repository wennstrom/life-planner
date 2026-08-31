import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const taskStatus = v.union(
  v.literal("backlog"),
  v.literal("in-progress"),
  v.literal("review"),
  v.literal("test"),
  v.literal("investigate"),
  v.literal("done"),
);

const projectStatus = v.union(v.literal("active"), v.literal("archived"));

const timeBlockOrigin = v.union(v.literal("app"), v.literal("google"));

const syncState = v.union(
  v.literal("synced"),
  v.literal("pending"),
  v.literal("error"),
);

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
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  tasks: defineTable({
    userId: v.string(),
    title: v.string(),
    notes: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    status: taskStatus,
    scheduledDate: v.optional(v.string()),
    estimateMinutes: v.optional(v.number()),
    dueDate: v.optional(v.string()),
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    order: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_scheduledDate", ["userId", "scheduledDate"])
    .index("by_project", ["projectId"]),

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

  notes: defineTable({
    userId: v.string(),
    title: v.string(),
    body: v.string(),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"]),

  dayRecords: defineTable({
    userId: v.string(),
    dateKey: v.string(),
    intention: v.optional(v.string()),
    shutdownCompletedAt: v.optional(v.number()),
    shutdownNote: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user_dateKey", ["userId", "dateKey"]),
});
