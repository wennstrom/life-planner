import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const taskStatus = v.union(
  v.literal("backlog"),
  v.literal("today"),
  v.literal("done"),
);

const projectStatus = v.union(v.literal("active"), v.literal("archived"));

const timeBlockOrigin = v.union(v.literal("app"), v.literal("google"));

const syncState = v.union(
  v.literal("synced"),
  v.literal("pending"),
  v.literal("error"),
);

export default defineSchema({
  ...authTables,

  googleAccounts: defineTable({
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiry: v.optional(v.number()),
    calendarSyncToken: v.optional(v.string()),
    watchChannelId: v.optional(v.string()),
    watchResourceId: v.optional(v.string()),
    watchExpiry: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  projects: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    status: projectStatus,
    order: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  tasks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    notes: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    status: taskStatus,
    scheduledDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    priority: v.optional(v.number()),
    order: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_scheduledDate", ["userId", "scheduledDate"])
    .index("by_project", ["projectId"]),

  timeBlocks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    start: v.number(),
    end: v.number(),
    taskId: v.optional(v.id("tasks")),
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

  notes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"]),
});
