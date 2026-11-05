import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { TOOL_NAMES } from "./toolDefs";
import { NO_TIMEZONE_ERROR, READ_ONLY_BLOCK_ERROR } from "./handlers";
import { AGENTS_CANT_MARK_DONE_ERROR } from "../lib/agentGate";
import { mcpRateLimiter } from "./rateLimits";
import {
  activityRows,
  callError,
  callOk,
  callTool,
  insertToken,
  scheduledJobs,
  setupMcp,
} from "./test.helpers";
import type { McpTest } from "./test.helpers";

afterEach(() => {
  vi.useRealTimers();
});

async function insertGoogleEvent(t: McpTest, userId: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("timeBlocks", {
      userId,
      title: "Dentist",
      start: Date.UTC(2026, 10, 5, 9),
      end: Date.UTC(2026, 10, 5, 10),
      origin: "google",
      googleEventId: "evt_1",
      syncState: "synced",
      updatedAt: Date.now(),
    }),
  );
}

describe("tool catalogue", () => {
  it("has no tool that deletes tasks", () => {
    expect(TOOL_NAMES).toContain("archive_task");
    expect(TOOL_NAMES.some((name) => /delete_task|remove_task/.test(name))).toBe(
      false,
    );
  });
});

describe("get_context", () => {
  it("returns local now, timezone, today and the done column", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T23:30:00Z"));
    const t = setupMcp();
    const token = await insertToken(t);
    await t
      .withIdentity({ subject: token.userId })
      .mutation(api.boardColumns.ensureDefaults, {});

    const context = await callOk(t, token, "get_context");
    expect(context).toMatchObject({
      now: "2026-11-05T00:30:00+01:00",
      timezone: "Europe/Stockholm",
      today: "2026-11-05",
      weekday: "Thursday",
    });
    const columns = await callOk(t, token, "list_columns");
    const done = columns.columns.find((c: { isDone: boolean }) => c.isDone);
    expect(context.doneColumnId).toBe(done.id);
  });

  it("errors until the app has stored a timezone", async () => {
    const t = setupMcp();
    const token = await insertToken(t, { timezone: null });
    expect(await callError(t, token, "get_context")).toBe(NO_TIMEZONE_ERROR);
  });
});

describe("tasks", () => {
  it("creates, updates, archives and unarchives a task", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const asUser = t.withIdentity({ subject: token.userId });
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Launch",
      color: "#3b82f6",
    });

    const created = await callOk(t, token, "create_task", {
      title: "Write spec",
      projectId,
      dueDate: "2026-11-10",
      estimateMinutes: 45,
      priority: 1,
      checklist: [{ text: "Outline" }, { text: "Draft", done: true }],
    });
    const taskId = created.task.id;
    expect(created.task).toMatchObject({
      title: "Write spec",
      projectId,
      dueDate: "2026-11-10",
      estimateMinutes: 45,
      priority: 1,
      archived: false,
      checklist: { done: 1, total: 2 },
    });

    const updated = await callOk(t, token, "update_task", {
      taskId,
      title: "Write the spec",
      priority: null,
      projectId: null,
    });
    expect(updated.task).toMatchObject({
      title: "Write the spec",
      priority: null,
      projectId: null,
    });

    await callOk(t, token, "archive_task", { taskId });
    let open = await callOk(t, token, "list_tasks");
    expect(open.tasks).toHaveLength(0);
    const archived = await callOk(t, token, "list_tasks", { archived: true });
    expect(archived.tasks.map((task: { id: string }) => task.id)).toEqual([
      taskId,
    ]);

    await callOk(t, token, "unarchive_task", { taskId });
    open = await callOk(t, token, "list_tasks");
    expect(open.tasks).toHaveLength(1);

    // The UI sees the same task the agent made.
    const uiTasks = await asUser.query(api.tasks.list, {});
    expect(uiTasks.map((task) => task.title)).toEqual(["Write the spec"]);

    const summaries = (await activityRows(t)).map((row) => row.summary);
    expect(summaries).toContain("Created 'Write spec'");
    expect(summaries).toContain("Archived 'Write the spec'");
    expect(summaries).toContain("Unarchived 'Write the spec'");
  });

  it("completes a task moved to the done column when the user allows it", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const asUser = t.withIdentity({ subject: token.userId });
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    await asUser.mutation(api.userSettings.setAgentsCanMarkDone, {
      value: true,
    });
    const { doneColumnId, agentsCanMarkDone } = await callOk(
      t,
      token,
      "get_context",
    );
    expect(agentsCanMarkDone).toBe(true);
    const { task } = await callOk(t, token, "create_task", { title: "Ship" });
    const moved = await callOk(t, token, "update_task", {
      taskId: task.id,
      columnId: doneColumnId,
    });
    expect(moved.task.done).toBe(true);
    const full = await callOk(t, token, "get_task", { taskId: task.id });
    expect(full.task.completedAt).toMatch(/\+0[12]:00$/);
  });

  it("filters and limits list_tasks", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    for (const [title, dueDate] of [
      ["A", "2026-11-01"],
      ["B", "2026-11-20"],
      ["C", undefined],
    ] as const) {
      await callOk(t, token, "create_task", { title, dueDate });
    }
    const due = await callOk(t, token, "list_tasks", { dueBefore: "2026-11-10" });
    expect(due.tasks.map((task: { title: string }) => task.title)).toEqual(["A"]);

    const limited = await callOk(t, token, "list_tasks", { limit: 2 });
    expect(limited).toMatchObject({ total: 3, truncated: true });
    expect(limited.tasks).toHaveLength(2);
  });

  it("rejects bad arguments and logs the failure", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    expect(await callError(t, token, "create_task", { title: "" })).toMatch(
      /^Invalid arguments: title/,
    );
    expect(
      await callError(t, token, "create_task", { title: "x", due_date: "x" }),
    ).toMatch(/Unrecognized key/);
    expect(
      await callError(t, token, "update_task", { taskId: "not-an-id" }),
    ).toBe("Task not found");
    const rows = await activityRows(t);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !row.ok)).toBe(true);
  });
});

describe("ownership", () => {
  it("keeps one user's token away from another user's data", async () => {
    const t = setupMcp();
    const alice = await insertToken(t, { userId: "user_alice" });
    const bob = await insertToken(t, { userId: "user_bob" });

    const { task } = await callOk(t, alice, "create_task", { title: "Private" });
    const { block } = await callOk(t, alice, "create_block", {
      title: "Focus",
      start: "2026-11-05T09:00:00+01:00",
      end: "2026-11-05T10:00:00+01:00",
    });

    expect((await callOk(t, bob, "list_tasks")).tasks).toEqual([]);
    expect(
      (
        await callOk(t, bob, "list_calendar", {
          start: "2026-11-05T00:00:00+01:00",
          end: "2026-11-06T00:00:00+01:00",
        })
      ).blocks,
    ).toEqual([]);
    expect(await callError(t, bob, "get_task", { taskId: task.id })).toBe(
      "Task not found",
    );
    expect(
      await callError(t, bob, "update_task", { taskId: task.id, title: "Mine" }),
    ).toBe("Task not found");
    expect(await callError(t, bob, "archive_task", { taskId: task.id })).toBe(
      "Task not found",
    );
    expect(
      await callError(t, bob, "update_block", {
        blockId: block.id,
        title: "Mine",
      }),
    ).toBe("Time block not found");
    expect(await callError(t, bob, "delete_block", { blockId: block.id })).toBe(
      "Time block not found",
    );
    expect(
      await callError(t, bob, "schedule_task", {
        taskId: task.id,
        start: "2026-11-05T09:00:00+01:00",
        durationMinutes: 30,
      }),
    ).toBe("Task not found");
    expect(
      await callError(t, bob, "create_block", {
        title: "Sneaky",
        start: "2026-11-05T09:00:00+01:00",
        end: "2026-11-05T10:00:00+01:00",
        taskIds: [task.id],
      }),
    ).toBe("Task not found");

    const aliceTask = await callOk(t, alice, "get_task", { taskId: task.id });
    expect(aliceTask.task.title).toBe("Private");
    // Bob's failed create_block left no half-made block behind.
    const blocks = await t.run(async (ctx) =>
      ctx.db.query("timeBlocks").collect(),
    );
    expect(blocks).toHaveLength(1);
  });
});

describe("calendar", () => {
  it("creates and updates blocks and schedules the Google sync", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const { task } = await callOk(t, token, "create_task", { title: "Review" });

    const { block } = await callOk(t, token, "create_block", {
      title: "Deep work",
      start: "2026-11-05T08:00:00Z",
      end: "2026-11-05T09:30:00Z",
      taskIds: [task.id],
    });
    expect(block).toMatchObject({
      title: "Deep work",
      start: "2026-11-05T09:00:00+01:00",
      end: "2026-11-05T10:30:00+01:00",
      editable: true,
      taskIds: [task.id],
    });
    expect(await scheduledJobs(t, "syncBlock")).toHaveLength(1);

    const { block: moved } = await callOk(t, token, "update_block", {
      blockId: block.id,
      start: "2026-11-05T13:00:00+01:00",
      end: "2026-11-05T14:00:00+01:00",
    });
    expect(moved.start).toBe("2026-11-05T13:00:00+01:00");
    expect(await scheduledJobs(t, "syncBlock")).toHaveLength(2);

    await callOk(t, token, "delete_block", { blockId: block.id });
    expect(await scheduledJobs(t, "deleteBlock")).toHaveLength(1);
  });

  it("schedules a task using its estimate", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const { task } = await callOk(t, token, "create_task", {
      title: "Plan week",
      estimateMinutes: 25,
    });
    const { block } = await callOk(t, token, "schedule_task", {
      taskId: task.id,
      start: "2026-11-05T09:00:00+01:00",
    });
    expect(block).toMatchObject({
      title: "Plan week",
      start: "2026-11-05T09:00:00+01:00",
      end: "2026-11-05T09:25:00+01:00",
      taskIds: [task.id],
    });

    const { task: bare } = await callOk(t, token, "create_task", {
      title: "No estimate",
    });
    expect(
      await callError(t, token, "schedule_task", {
        taskId: bare.id,
        start: "2026-11-05T09:00:00+01:00",
      }),
    ).toMatch(/no time estimate/);
  });

  it("shows Google events as read-only and refuses to change them", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const eventId = await insertGoogleEvent(t, token.userId);

    const { blocks } = await callOk(t, token, "list_calendar", {
      start: "2026-11-05T00:00:00+01:00",
      end: "2026-11-06T00:00:00+01:00",
    });
    expect(blocks).toEqual([
      expect.objectContaining({ id: eventId, editable: false, origin: "google" }),
    ]);

    expect(
      await callError(t, token, "update_block", {
        blockId: eventId,
        title: "Moved",
      }),
    ).toBe(READ_ONLY_BLOCK_ERROR);
    expect(await callError(t, token, "delete_block", { blockId: eventId })).toBe(
      READ_ONLY_BLOCK_ERROR,
    );

    const event = await t.run(async (ctx) => ctx.db.get(eventId));
    expect(event?.title).toBe("Dentist");
    expect(event?.syncState).toBe("synced");
    const rows = await activityRows(t);
    expect(
      rows
        .filter((row) => row.tool !== "list_calendar")
        .map((row) => [row.tool, row.ok, row.targetIds]),
    ).toEqual([
      ["update_block", false, [eventId]],
      ["delete_block", false, [eventId]],
    ]);
  });

  it("rejects times without an offset, backwards ranges and long ranges", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    expect(
      await callError(t, token, "create_block", {
        title: "Local",
        start: "2026-11-05T09:00:00",
        end: "2026-11-05T10:00:00",
      }),
    ).toMatch(/start: must be an ISO 8601 time with a UTC offset/);
    expect(
      await callError(t, token, "create_block", {
        title: "Backwards",
        start: "2026-11-05T10:00:00Z",
        end: "2026-11-05T09:00:00Z",
      }),
    ).toBe("end must be after start");
    expect(
      await callError(t, token, "list_calendar", {
        start: "2026-11-01T00:00:00Z",
        end: "2026-12-15T00:00:00Z",
      }),
    ).toBe("The range can be at most 31 days");
    expect(await scheduledJobs(t, "syncBlock")).toHaveLength(0);
  });
});

describe("rate limits", () => {
  it("refuses the 61st write in a minute with a retry delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    const t = setupMcp();
    const token = await insertToken(t);
    const { task } = await callOk(t, token, "create_task", { title: "Busy" });
    for (let i = 0; i < 59; i++) {
      await callOk(t, token, "update_task", {
        taskId: task.id,
        title: `Busy ${i}`,
      });
    }
    const outcome = await callTool(t, token, "update_task", {
      taskId: task.id,
      title: "One too many",
    });
    expect(outcome).toMatchObject({ ok: false });
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/Rate limit reached for writes/);
    expect(outcome.retryAfterMs).toBeGreaterThan(0);

    // Reads have their own bucket.
    await callOk(t, token, "list_tasks");

    vi.advanceTimersByTime(2_000);
    await callOk(t, token, "update_task", { taskId: task.id, title: "Later" });
  });

  it("caps calendar writes per day separately from the write limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    const t = setupMcp();
    const token = await insertToken(t);
    await t.run(async (ctx) => {
      await mcpRateLimiter.limit(ctx, "calendar", {
        key: token.tokenId,
        count: 100,
      });
    });

    const error = await callError(t, token, "create_block", {
      title: "Too many",
      start: "2026-11-05T09:00:00+01:00",
      end: "2026-11-05T10:00:00+01:00",
    });
    expect(error).toMatch(/Rate limit reached for calendar changes/);
    // Task writes still work.
    await callOk(t, token, "create_task", { title: "Fine" });
  });
});

describe("done gate", () => {
  async function setup() {
    const t = setupMcp();
    const token = await insertToken(t);
    const asUser = t.withIdentity({ subject: token.userId });
    const columns = await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const done = columns.find((column) => column.isDone)!;
    const review = columns.find((column) => column.name === "Review")!;
    const test = columns.find((column) => column.name === "Test")!;
    return { t, token, asUser, done, review, test };
  }

  it("reports the setting and the Test and Review columns", async () => {
    const { t, token, review, test, done } = await setup();
    expect(await callOk(t, token, "get_context")).toMatchObject({
      agentsCanMarkDone: false,
      doneColumnId: done._id,
      testColumnId: test._id,
      reviewColumnId: review._id,
    });
  });

  it("refuses to create or move tasks into Done by default", async () => {
    const { t, token, asUser, done, review } = await setup();
    expect(
      await callError(t, token, "create_task", {
        title: "Sneaky",
        columnId: done._id,
      }),
    ).toBe(AGENTS_CANT_MARK_DONE_ERROR);
    const { task } = await callOk(t, token, "create_task", { title: "Work" });
    expect(
      await callError(t, token, "update_task", {
        taskId: task.id,
        columnId: done._id,
        title: "Renamed",
      }),
    ).toBe(AGENTS_CANT_MARK_DONE_ERROR);
    // Nothing from the refused call was written.
    const unchanged = await callOk(t, token, "get_task", { taskId: task.id });
    expect(unchanged.task).toMatchObject({ title: "Work", done: false });

    // Review is fine, and so is leaving a done task in Done.
    await callOk(t, token, "update_task", {
      taskId: task.id,
      columnId: review._id,
    });
    await asUser.mutation(api.tasks.update, {
      taskId: task.id,
      columnId: done._id,
    });
    const edited = await callOk(t, token, "update_task", {
      taskId: task.id,
      columnId: done._id,
      title: "Edited after done",
    });
    expect(edited.task).toMatchObject({ done: true, title: "Edited after done" });
    // The user can still move tasks into Done from the app.
    const uiTask = await asUser.mutation(api.tasks.create, {
      title: "UI",
      columnId: done._id,
    });
    expect(uiTask).toBeTruthy();
  });

  it("allows Done once the user turns the setting on, and off again", async () => {
    const { t, token, asUser, done } = await setup();
    await asUser.mutation(api.userSettings.setAgentsCanMarkDone, {
      value: true,
    });
    const created = await callOk(t, token, "create_task", {
      title: "Finished",
      columnId: done._id,
    });
    expect(created.task.done).toBe(true);
    await asUser.mutation(api.userSettings.setAgentsCanMarkDone, {
      value: false,
    });
    expect(
      await callError(t, token, "create_task", {
        title: "Again",
        columnId: done._id,
      }),
    ).toBe(AGENTS_CANT_MARK_DONE_ERROR);
  });
});

describe("activity log", () => {
  it("writes one row per call, failed or not", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    await callOk(t, token, "list_tasks");
    await callError(t, token, "get_task", { taskId: "missing" });
    const { task } = await callOk(t, token, "create_task", { title: "Logged" });

    const rows = await activityRows(t);
    expect(rows.map((row) => [row.tool, row.ok])).toEqual([
      ["list_tasks", true],
      ["get_task", false],
      ["create_task", true],
    ]);
    expect(rows[1].summary).toBe("Task not found");
    expect(rows[2].targetIds).toEqual([task.id]);
    expect(rows.every((row) => row.tokenId === token.tokenId)).toBe(true);
  });

  it("records the agent and session on every row, failed or not", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const readOnly = await insertToken(t, { scope: "read" });
    await callOk(t, token, "list_tasks", {}, { sessionId: "run-1" });
    await callError(t, token, "get_task", { taskId: "missing" }, {
      sessionId: "run-1",
    });
    await callOk(t, token, "list_tasks");
    await callError(t, readOnly, "create_task", { title: "No" }, {
      sessionId: "ro-run",
    });

    const rows = await activityRows(t);
    expect(rows.map((row) => [row.tool, row.agent, row.sessionId])).toEqual([
      ["list_tasks", "Test token", "run-1"],
      ["get_task", "Test token", "run-1"],
      ["list_tasks", "Test token", undefined],
      ["create_task", "Test token", "ro-run"],
    ]);
  });

  it("rejects a malformed session without running the tool", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const error = await callError(t, token, "create_task", { title: "No" }, {
      sessionId: "bad session",
    });
    expect(error).toMatch(/Session IDs are/);
    expect(await activityRows(t)).toHaveLength(0);
    expect((await callOk(t, token, "list_tasks")).tasks).toHaveLength(0);
  });
});
