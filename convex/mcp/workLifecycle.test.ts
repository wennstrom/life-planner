import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { CLAIM_CLEANUP_BATCH } from "../lib/taskClaims";
import { MAX_PULLABLE_SCAN } from "../lib/pullableTasks";
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
import type { Id } from "../_generated/dataModel";

const SESSION = "run:laptop-1";
const header = { sessionId: SESSION };
const completed = {
  summary: "Implemented the change",
  testList: ["vitest run passes"],
  nextSteps: ["Review the result"],
  tester: "agent" as const,
};

afterEach(() => vi.useRealTimers());

async function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  const t = setupMcp();
  const token = await insertToken(t);
  const asUser = t.withIdentity({ subject: token.userId });
  await asUser.mutation(api.boardColumns.ensureDefaults, {});
  const columns = await asUser.query(api.boardColumns.list, {});
  const taskId = await asUser.mutation(api.tasks.create, {
    title: "Build work",
    estimateMinutes: 30,
  });
  await asUser.mutation(api.tasks.setPullable, { taskId, pullable: true });
  return { t, token, asUser, columns, taskId };
}

async function snapshot(t: ReturnType<typeof setupMcp>, taskId: Id<"tasks">) {
  return await t.run(async (ctx) => ({
    task: await ctx.db.get("tasks", taskId),
    claims: await ctx.db.query("taskClaims").collect(),
    handoffs: await ctx.db.query("taskHandoffs").collect(),
    tasks: await ctx.db.query("tasks").collect(),
  }));
}

describe("claim lifecycle through MCP", () => {
  it("claims, renews only the same token/session, and releases; logs identity and targets", async () => {
    const { t, token, taskId, columns } = await fixture();
    const first = await callOk(t, token, "claim_task", { taskId }, header);
    expect(first.claim).toMatchObject({
      agent: "Test token",
      sessionId: SESSION,
      claimedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60_000,
    });
    expect((await snapshot(t, taskId)).task?.columnId).toBe(columns[0]!._id);
    expect((await callOk(t, token, "get_task", { taskId })).task.claim).toEqual(
      first.claim,
    );
    vi.setSystemTime(Date.now() + 60_000);
    const renewed = await callOk(
      t,
      token,
      "claim_task",
      { taskId, leaseMinutes: 120 },
      header,
    );
    expect(renewed.claim.claimedAt).toBe(first.claim.claimedAt);
    expect(renewed.claim.expiresAt).toBe(Date.now() + 120 * 60_000);
    const beat = await callOk(
      t,
      token,
      "heartbeat_claim",
      { taskId, leaseMinutes: 1 },
      header,
    );
    expect(beat.claim.expiresAt).toBe(Date.now() + 60_000);
    expect((await snapshot(t, taskId)).claims).toHaveLength(1);
    await callOk(t, token, "release_claim", { taskId }, header);
    expect(
      (await callOk(t, token, "get_task", { taskId })).task.claim,
    ).toBeNull();
    const activity = await activityRows(t);
    for (const row of activity.filter((row) =>
      ["claim_task", "heartbeat_claim", "release_claim"].includes(row.tool),
    )) {
      expect(row).toMatchObject({
        tokenId: token.tokenId,
        agent: "Test token",
        sessionId: SESSION,
        ok: true,
        targetIds: [taskId],
      });
    }
  });

  it("argument session overrides the header and token identity prevents session hijacking", async () => {
    const { t, token, taskId } = await fixture();
    await callOk(
      t,
      token,
      "claim_task",
      { taskId, sessionId: "override" },
      header,
    );
    const rival = await insertToken(t);
    for (const tool of [
      "claim_task",
      "heartbeat_claim",
      "release_claim",
      "complete_work",
    ]) {
      expect(
        await callError(t, rival, tool, {
          taskId,
          sessionId: "override",
          ...(tool === "complete_work" ? completed : {}),
        }),
      ).toContain("Claimed by");
      expect(
        await callError(t, token, tool, {
          taskId,
          sessionId: "different",
          ...(tool === "complete_work" ? completed : {}),
        }),
      ).toContain("Claimed by");
    }
    await callOk(
      t,
      token,
      "heartbeat_claim",
      { taskId, sessionId: "override" },
      header,
    );
    expect((await activityRows(t)).at(-1)?.sessionId).toBe("override");
  });

  it.each(["claim_task", "heartbeat_claim", "release_claim", "complete_work"])(
    "%s requires a valid session",
    async (tool) => {
      const { t, token, taskId } = await fixture();
      const args = { taskId, ...(tool === "complete_work" ? completed : {}) };
      expect(await callError(t, token, tool, args)).toContain(
        "session is required",
      );
      for (const sessionId of ["", "bad session", "x".repeat(129), "å"]) {
        expect(
          await callError(t, token, tool, { ...args, sessionId }, header),
        ).toContain("Invalid arguments");
        expect(await callError(t, token, tool, args, { sessionId })).toContain(
          "Session IDs",
        );
      }
      expect((await snapshot(t, taskId)).claims).toHaveLength(0);
    },
  );

  it.each(["claim_task", "heartbeat_claim"])(
    "%s rejects invalid lease lengths at the tool boundary",
    async (tool) => {
      const { t, token, taskId } = await fixture();
      await callOk(t, token, "claim_task", { taskId }, header);
      const before = (await snapshot(t, taskId)).claims;
      for (const leaseMinutes of [0, -1, 1.5, 121, Infinity, NaN]) {
        expect(
          await callError(t, token, tool, { taskId, leaseMinutes }, header),
        ).toContain("Invalid arguments");
      }
      expect((await snapshot(t, taskId)).claims).toEqual(before);
    },
  );

  it("treats expiry as released exactly at the TTL, before cleanup", async () => {
    const { t, token, taskId } = await fixture();
    const { claim } = await callOk(
      t,
      token,
      "claim_task",
      { taskId, leaseMinutes: 1 },
      header,
    );
    vi.setSystemTime(claim.expiresAt - 1);
    expect(
      (await callOk(t, token, "get_task", { taskId })).task.claim,
    ).not.toBeNull();
    expect((await callOk(t, token, "list_pullable_tasks")).tasks).toHaveLength(
      0,
    );
    vi.setSystemTime(claim.expiresAt);
    expect(
      (await callOk(t, token, "get_task", { taskId })).task.claim,
    ).toBeNull();
    expect((await callOk(t, token, "list_pullable_tasks")).tasks).toHaveLength(
      1,
    );
    for (const tool of ["heartbeat_claim", "release_claim", "complete_work"]) {
      expect(
        await callError(
          t,
          token,
          tool,
          { taskId, ...(tool === "complete_work" ? completed : {}) },
          header,
        ),
      ).toContain("No active claim");
    }
    const rival = await insertToken(t);
    await callOk(t, rival, "update_task", {
      taskId,
      notes: "Expiry frees writes",
    });
    await callOk(t, rival, "claim_task", { taskId }, { sessionId: "new-run" });
    const after = await snapshot(t, taskId);
    expect(after.claims).toHaveLength(1);
    expect(after.claims[0]?.tokenId).toBe(rival.tokenId);
    expect(after.claims[0]?.claimedAt).toBe(claim.expiresAt);
  });

  it("rejects competing claims without replacing or renewing the winner", async () => {
    const { t, token, taskId } = await fixture();
    const rival = await insertToken(t);
    await callOk(t, token, "claim_task", { taskId }, header);
    const before = await snapshot(t, taskId);
    expect(
      await callError(t, rival, "claim_task", { taskId }, header),
    ).toContain("Claimed by Test token until");
    expect(await snapshot(t, taskId)).toEqual(before);
  });

  it("serializes simultaneous contenders to one active lease", async () => {
    const { t, token, taskId } = await fixture();
    const rival = await insertToken(t);
    const results = await Promise.all([
      callTool(t, token, "claim_task", { taskId }, header),
      callTool(t, rival, "claim_task", { taskId }, header),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect((await snapshot(t, taskId)).claims).toHaveLength(1);
  });

  it.each(["not-pullable", "archived", "done", "blocked"])(
    "rejects %s tasks atomically",
    async (state) => {
      const { t, token, taskId, asUser, columns } = await fixture();
      if (state === "not-pullable")
        await asUser.mutation(api.tasks.setPullable, {
          taskId,
          pullable: false,
        });
      if (state === "archived")
        await asUser.mutation(api.tasks.update, { taskId, archived: true });
      if (state === "done")
        await asUser.mutation(api.tasks.update, {
          taskId,
          columnId: columns.find((c) => c.isDone)!._id,
        });
      if (state === "blocked") {
        const blockerTaskId = await asUser.mutation(api.tasks.create, {
          title: "Waiting for spec",
        });
        await asUser.mutation(api.taskBlockers.add, { taskId, blockerTaskId });
      }
      const before = await snapshot(t, taskId);
      const error = await callError(t, token, "claim_task", { taskId }, header);
      expect(error).toContain(
        state === "blocked"
          ? "Waiting for spec"
          : state === "not-pullable"
            ? "pullable"
            : state,
      );
      expect(await snapshot(t, taskId)).toEqual(before);
    },
  );

  it("allows claims when blockers are done/archived and when In Progress is absent", async () => {
    const { t, token, taskId, asUser, columns } = await fixture();
    for (const archived of [true, false]) {
      const blockerTaskId = await asUser.mutation(api.tasks.create, {
        title: "Closed",
        columnId: archived ? undefined : columns.find((c) => c.isDone)!._id,
      });
      if (archived)
        await asUser.mutation(api.tasks.update, {
          taskId: blockerTaskId,
          archived: true,
        });
      await asUser.mutation(api.taskBlockers.add, { taskId, blockerTaskId });
    }
    await asUser.mutation(api.boardColumns.remove, {
      columnId: columns[0]!._id,
    });
    await callOk(t, token, "claim_task", { taskId }, header);
    expect((await snapshot(t, taskId)).task?.columnId).toBeUndefined();
  });

  it("humans can edit and force release; other users cannot read/release", async () => {
    const { t, token, taskId, asUser } = await fixture();
    await callOk(t, token, "claim_task", { taskId }, header);
    const other = t.withIdentity({ subject: "other-user" });
    await expect(
      other.mutation(api.taskClaims.forceRelease, { taskId }),
    ).rejects.toThrow("Task not found");
    await expect(
      other.query(api.taskClaims.get, { taskId, now: Date.now() }),
    ).rejects.toThrow("Task not found");
    await expect(
      other.query(api.taskHandoffs.listForTask, { taskId }),
    ).rejects.toThrow("Task not found");
    expect(await other.query(api.tasks.get, { taskId })).toBeNull();
    await expect(
      t.mutation(api.taskClaims.forceRelease, { taskId }),
    ).rejects.toThrow("Not authenticated");
    expect(
      await asUser.query(api.taskClaims.get, { taskId, now: Date.now() }),
    ).not.toBeNull();
    expect(
      await asUser.query(api.taskClaims.get, {
        taskId,
        now: Date.now() + 30 * 60_000,
      }),
    ).toBeNull();
    await asUser.mutation(api.tasks.update, { taskId, title: "Human edit" });
    await asUser.mutation(api.taskClaims.forceRelease, { taskId });
    expect((await snapshot(t, taskId)).claims).toHaveLength(0);
  });
});

describe("all existing MCP writes respect claims", () => {
  const tools = [
    "update_task",
    "archive_task",
    "unarchive_task",
    "schedule_task",
    "add_blocked_by",
    "remove_blocked_by",
    "create_block",
    "update_block",
    "delete_block",
  ];
  it.each(tools)(
    "%s refuses other tokens/sessions, permits owner session",
    async (tool) => {
      const { t, token, taskId, asUser } = await fixture();
      const rival = await insertToken(t);
      const blockerTaskId = await asUser.mutation(api.tasks.create, {
        title: "Other task",
      });
      const start = "2026-11-06T09:00:00+01:00";
      const end = "2026-11-06T10:00:00+01:00";
      const block = await callOk(t, token, "create_block", {
        title: "Work",
        start,
        end,
        taskIds: [taskId],
      });
      await callOk(t, token, "claim_task", { taskId }, header);
      if (tool === "remove_blocked_by")
        await asUser.mutation(api.taskBlockers.add, { taskId, blockerTaskId });
      const args: Record<string, unknown> =
        tool === "create_block"
          ? { title: "New", start, end, taskIds: [taskId] }
          : tool === "update_block"
            ? { blockId: block.block.id, taskIds: [] }
            : tool === "delete_block"
              ? { blockId: block.block.id }
              : tool === "schedule_task"
                ? { taskId, start, end }
                : tool.includes("blocked_by")
                  ? { taskId, blockerTaskId }
                  : {
                      taskId,
                      ...(tool === "update_task"
                        ? { title: "Agent edit" }
                        : {}),
                    };
      const before = await snapshot(t, taskId);
      expect(await callError(t, rival, tool, args, header)).toContain(
        "Claimed by",
      );
      expect(
        await callError(t, token, tool, args, { sessionId: "other-run" }),
      ).toContain("Claimed by");
      expect(await callError(t, token, tool, args)).toContain("Claimed by");
      expect(await snapshot(t, taskId)).toEqual(before);
      await callOk(t, token, tool, args, header);
    },
  );

  it("guards either side of blocker changes and both old/new calendar memberships", async () => {
    const { t, token, taskId, asUser } = await fixture();
    const rival = await insertToken(t);
    const otherTask = await asUser.mutation(api.tasks.create, {
      title: "Other",
    });
    const block = await callOk(t, token, "create_block", {
      title: "Empty",
      start: "2026-11-06T09:00:00Z",
      end: "2026-11-06T10:00:00Z",
    });
    await callOk(t, token, "claim_task", { taskId }, header);
    for (const tool of ["add_blocked_by", "remove_blocked_by"]) {
      expect(
        await callError(
          t,
          rival,
          tool,
          { taskId: otherTask, blockerTaskId: taskId },
          header,
        ),
      ).toContain("Claimed by");
    }
    expect(
      await callError(
        t,
        rival,
        "update_block",
        { blockId: block.block.id, taskIds: [taskId] },
        header,
      ),
    ).toContain("Claimed by");
    await callOk(
      t,
      token,
      "update_block",
      { blockId: block.block.id, taskIds: [taskId] },
      header,
    );
    for (const change of [
      { title: "Rename" },
      { start: "2026-11-06T08:00:00Z" },
      { end: "2026-11-06T11:00:00Z" },
      { taskIds: [otherTask] },
    ]) {
      expect(
        await callError(
          t,
          rival,
          "update_block",
          { blockId: block.block.id, ...change },
          header,
        ),
      ).toContain("Claimed by");
    }
    expect(
      (
        await callOk(t, token, "list_calendar", {
          start: "2026-11-06T00:00:00Z",
          end: "2026-11-07T00:00:00Z",
        })
      ).blocks[0].taskIds,
    ).toEqual([taskId]);
    const logged = (await activityRows(t)).find(
      (row) => row.tool === "update_block" && row.ok,
    );
    expect(logged?.targetIds).toContain(taskId);
  });
});

describe("new tool auth, scopes and rate limits", () => {
  it.each([
    "claim_task",
    "heartbeat_claim",
    "release_claim",
    "complete_work",
    "list_pullable_tasks",
  ])("%s enforces scope/ownership and charges its bucket", async (tool) => {
    const { t, token, taskId } = await fixture();
    const reader = await insertToken(t, { scope: "read" });
    const other = await insertToken(t, { userId: "other-user" });
    const args =
      tool === "list_pullable_tasks"
        ? {}
        : { taskId, ...(tool === "complete_work" ? completed : {}) };
    if (tool !== "list_pullable_tasks") {
      expect(await callError(t, reader, tool, args, header)).toContain(
        "read-only",
      );
      expect(await callError(t, other, tool, args, header)).toContain(
        "Task not found",
      );
    } else {
      expect((await callOk(t, reader, tool)).tasks).toHaveLength(1);
      expect((await callOk(t, other, tool)).tasks).toHaveLength(0);
    }
    const bucket = tool === "list_pullable_tasks" ? "read" : "write";
    await t.run((ctx) =>
      mcpRateLimiter.limit(ctx, bucket, {
        key: token.tokenId,
        count: bucket === "read" ? 300 : 60,
      }),
    );
    expect(await callError(t, token, tool, args, header)).toContain(
      "Rate limit",
    );
  });
});

describe("list_pullable_tasks", () => {
  it("filters by owned project/label, excludes closed/blocked/claimed, sorts priority then board order and returns compact rows", async () => {
    const { t, token, taskId, asUser, columns } = await fixture();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Project",
      color: "#3b82f6",
    });
    const labelId = await asUser.mutation(api.labels.create, {
      name: "Epic",
      color: "#3b82f6",
    });
    await asUser.mutation(api.tasks.update, {
      taskId,
      projectId,
      labelIds: [labelId],
      priority: 3,
    });
    const ids: Array<Id<"tasks">> = [];
    for (const [title, priority] of [
      ["High later", 1],
      ["High earlier", 1],
      ["No priority", undefined],
      ["Medium", 2],
      ["Blocked", 1],
      ["Claimed", 1],
      ["Done", 1],
      ["Archived", 1],
      ["Not pullable", 1],
      ["Other label", 1],
    ] as const) {
      const id = await asUser.mutation(api.tasks.create, {
        title,
        priority,
        projectId,
        labelIds: title === "Other label" ? [] : [labelId],
      });
      ids.push(id);
      if (title !== "Not pullable")
        await asUser.mutation(api.tasks.setPullable, {
          taskId: id,
          pullable: true,
        });
    }
    await t.run(async (ctx) => {
      await ctx.db.patch("tasks", ids[0]!, { order: 9 });
      await ctx.db.patch("tasks", ids[1]!, { order: 2 });
    });
    const blockerTaskId = await asUser.mutation(api.tasks.create, {
      title: "Unfinished prerequisite",
    });
    await asUser.mutation(api.taskBlockers.add, {
      taskId: ids[4]!,
      blockerTaskId,
    });
    await callOk(t, token, "claim_task", { taskId: ids[5]! }, header);
    await asUser.mutation(api.tasks.update, {
      taskId: ids[6]!,
      columnId: columns.find((c) => c.isDone)!._id,
    });
    await asUser.mutation(api.tasks.update, {
      taskId: ids[7]!,
      archived: true,
    });
    const result = await callOk(t, token, "list_pullable_tasks", {
      projectId,
      labelId,
    });
    expect(result.tasks.map((r: { title: string }) => r.title)).toEqual([
      "High earlier",
      "High later",
      "Medium",
      "Build work",
      "No priority",
    ]);
    expect(Object.keys(result.tasks[0]).sort()).toEqual([
      "dueDate",
      "estimateMinutes",
      "id",
      "priority",
      "projectId",
      "title",
    ]);
    expect(result.truncated).toBe(false);
    const limited = await callOk(t, token, "list_pullable_tasks", {
      projectId,
      labelId,
      limit: 2,
    });
    expect(limited.tasks).toHaveLength(2);
    expect(limited.truncated).toBe(true);
    expect(limited.scanLimited).toBe(false);
    const other = t.withIdentity({ subject: "other" });
    const foreignProject = await other.mutation(api.projects.create, {
      name: "Foreign",
      color: "#3b82f6",
    });
    const foreignLabel = await other.mutation(api.labels.create, {
      name: "Foreign",
      color: "#3b82f6",
    });
    expect(
      await callError(t, token, "list_pullable_tasks", {
        projectId: foreignProject,
      }),
    ).toContain("Project not found");
    expect(
      await callError(t, token, "list_pullable_tasks", {
        labelId: foreignLabel,
      }),
    ).toContain("Label not found");
    for (const limit of [0, -1, 1.5, 101])
      expect(
        await callError(t, token, "list_pullable_tasks", { limit }),
      ).toContain("Invalid arguments");
  });

  it("defaults to 20, permits 100, and explicitly reports capped discovery", async () => {
    const { t, token } = await fixture();
    await t.run(async (ctx) => {
      for (let i = 0; i <= MAX_PULLABLE_SCAN; i++)
        await ctx.db.insert("tasks", {
          userId: token.userId,
          title: `Task ${i}`,
          order: i,
          pullable: true,
        });
    });
    const result = await callOk(t, token, "list_pullable_tasks");
    expect(result.tasks).toHaveLength(20);
    expect(result).toMatchObject({
      truncated: true,
      scanLimited: true,
      scanned: MAX_PULLABLE_SCAN,
    });
    expect(result.notice).toContain("sorted within that scan");
    expect(
      (await callOk(t, token, "list_pullable_tasks", { limit: 100 })).tasks,
    ).toHaveLength(100);
  });
});

describe("complete_work", () => {
  it("atomically saves structured handoff, moves to Test, releases and creates unblocked backlog follow-ups", async () => {
    const { t, token, taskId, asUser, columns } = await fixture();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Project",
      color: "#3b82f6",
    });
    await asUser.mutation(api.tasks.update, { taskId, projectId });
    await callOk(t, token, "claim_task", { taskId }, header);
    const result = await callOk(
      t,
      token,
      "complete_work",
      {
        taskId,
        ...completed,
        followUps: [
          { title: "Next job", notes: "Do this next" },
          { title: "Another job" },
        ],
      },
      header,
    );
    const state = await snapshot(t, taskId);
    expect(state.task?.columnId).toBe(columns[1]!._id);
    expect(state.task?.completedAt).toBeUndefined();
    expect(state.claims).toHaveLength(0);
    expect(state.handoffs).toHaveLength(1);
    expect(state.handoffs[0]).toMatchObject({
      taskId,
      userId: token.userId,
      tokenId: token.tokenId,
      sessionId: SESSION,
      agent: "Test token",
      ...completed,
      followUpTaskIds: result.followUpTaskIds,
      at: Date.now(),
    });
    for (const id of result.followUpTaskIds) {
      const task = state.tasks.find((row) => row._id === id)!;
      expect(task.projectId).toBe(projectId);
      expect(task.columnId).toBeUndefined();
      expect(task.pullable).not.toBe(true);
      expect(
        (await callOk(t, token, "get_task", { taskId: id })).task.blockedBy,
      ).toEqual([]);
    }
    expect(
      (await callOk(t, token, "get_task", { taskId })).task.latestHandoff._id,
    ).toBe(result.handoffId);
    const history = await asUser.query(api.taskHandoffs.listForTask, {
      taskId,
    });
    expect(history.handoffs[0]?.followUps.map((row) => row.title)).toEqual([
      "Next job",
      "Another job",
    ]);
    expect(
      (await activityRows(t)).find((row) => row.tool === "complete_work")
        ?.targetIds,
    ).toEqual([taskId, result.handoffId, ...result.followUpTaskIds]);
    await asUser.mutation(api.tasks.remove, {
      taskId: result.followUpTaskIds[0],
    });
    expect(
      (await asUser.query(api.taskHandoffs.listForTask, { taskId })).handoffs[0]
        ?.followUps[0],
    ).toMatchObject({ title: "Deleted task", available: false });
    await asUser.mutation(api.tasks.remove, { taskId });
    expect((await snapshot(t, taskId)).handoffs).toHaveLength(0);
    expect(
      await asUser.query(api.tasks.get, { taskId: result.followUpTaskIds[1] }),
    ).not.toBeNull();
  });

  it("missing Test rolls back all changes and preserves the claim", async () => {
    const { t, token, taskId, asUser, columns } = await fixture();
    await callOk(t, token, "claim_task", { taskId }, header);
    await asUser.mutation(api.boardColumns.remove, {
      columnId: columns[1]!._id,
    });
    const before = await snapshot(t, taskId);
    expect(
      await callError(
        t,
        token,
        "complete_work",
        { taskId, ...completed, followUps: [{ title: "Must not exist" }] },
        header,
      ),
    ).toContain("Add a Test column");
    expect(await snapshot(t, taskId)).toEqual(before);
  });

  it("invalid handoff/follow-ups roll back and preserve the claim", async () => {
    const { t, token, taskId } = await fixture();
    await callOk(t, token, "claim_task", { taskId }, header);
    const before = await snapshot(t, taskId);
    for (const invalid of [
      { summary: " " },
      { summary: "x".repeat(10001) },
      { testList: ["x".repeat(2001)] },
      { nextSteps: Array(51).fill("step") },
      { tester: "invalid" },
      { followUps: Array(11).fill({ title: "Too many" }) },
      { followUps: [{ title: "Valid first" }, { title: " " }] },
      { followUps: [{ title: "x".repeat(501) }] },
      { followUps: [{ title: "Next", notes: "x".repeat(20001) }] },
    ]) {
      expect(
        await callError(
          t,
          token,
          "complete_work",
          { taskId, ...completed, ...invalid },
          header,
        ),
      ).toContain("Invalid arguments");
      expect(await snapshot(t, taskId)).toEqual(before);
    }
    // Fail inside the transaction too: dangling project after a valid claim.
    const projectId = await t.run(async (ctx) =>
      ctx.db.insert("projects", {
        userId: token.userId,
        name: "Removed",
        color: "#3b82f6",
        status: "active",
        order: 0,
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("tasks", taskId, { projectId });
      await ctx.db.delete("projects", projectId);
    });
    const dangling = await snapshot(t, taskId);
    expect(
      await callError(
        t,
        token,
        "complete_work",
        { taskId, ...completed, followUps: [{ title: "Fails ownership" }] },
        header,
      ),
    ).toContain("Project not found");
    expect(await snapshot(t, taskId)).toEqual(dangling);
  });

  it.each(["in progress", "test"])(
    "applies agentGate when named %s column has the done role",
    async (role) => {
      const { t, token, taskId, asUser, columns } = await fixture();
      if (role === "test")
        await callOk(t, token, "claim_task", { taskId }, header);
      const target = role === "test" ? columns[1]! : columns[0]!;
      await t.run(async (ctx) => {
        await ctx.db.patch("boardColumns", columns.find((c) => c.isDone)!._id, {
          isDone: false,
        });
        await ctx.db.patch("boardColumns", target._id, { isDone: true });
      });
      const before = await snapshot(t, taskId);
      const tool = role === "test" ? "complete_work" : "claim_task";
      const args = {
        taskId,
        ...(role === "test"
          ? { ...completed, followUps: [{ title: "Follow up" }] }
          : {}),
      };
      expect(await callError(t, token, tool, args, header)).toBe(
        AGENTS_CANT_MARK_DONE_ERROR,
      );
      expect(await snapshot(t, taskId)).toEqual(before);
      await asUser.mutation(api.userSettings.setAgentsCanMarkDone, {
        value: true,
      });
      await callOk(t, token, tool, args, header);
      expect((await snapshot(t, taskId)).task?.completedAt).toBe(Date.now());
    },
  );

  it("requires an active claim and supports user testing and no follow-ups", async () => {
    const { t, token, taskId } = await fixture();
    expect(
      await callError(
        t,
        token,
        "complete_work",
        { taskId, ...completed },
        header,
      ),
    ).toContain("No active claim");
    await callOk(t, token, "claim_task", { taskId }, header);
    const result = await callOk(
      t,
      token,
      "complete_work",
      { taskId, ...completed, tester: "user", testList: [], nextSteps: [] },
      header,
    );
    expect(result.followUpTaskIds).toEqual([]);
    expect((await snapshot(t, taskId)).handoffs[0]?.tester).toBe("user");
  });
});

describe("bounded operational cleanup", () => {
  it("cleans expired claims at boundary, keeps active rows and schedules remaining batch", async () => {
    const { t, token, taskId } = await fixture();
    await callOk(t, token, "claim_task", { taskId }, header);
    await t.run(async (ctx) => {
      for (let i = 0; i < CLAIM_CLEANUP_BATCH + 5; i++) {
        const id = await ctx.db.insert("tasks", {
          userId: token.userId,
          title: "Expired",
          order: i,
        });
        await ctx.db.insert("taskClaims", {
          userId: token.userId,
          taskId: id,
          tokenId: token.tokenId,
          agent: "Old",
          sessionId: SESSION,
          claimedAt: Date.now() - 1000,
          expiresAt: Date.now(),
        });
      }
    });
    expect(await t.mutation(internal.taskClaims.cleanupExpired, {})).toBe(
      CLAIM_CLEANUP_BATCH,
    );
    expect((await snapshot(t, taskId)).claims).toHaveLength(6);
    expect(await scheduledJobs(t, "taskClaims:cleanupExpired")).toHaveLength(1);
    await t.mutation(internal.taskClaims.cleanupExpired, {});
    expect((await snapshot(t, taskId)).claims).toHaveLength(1);
    expect(
      (await callOk(t, token, "get_task", { taskId })).task.claim,
    ).not.toBeNull();
  });

  it("deleting a task removes its claim and bounded handoffs, preserving dependency cleanup", async () => {
    const { t, token, taskId, asUser } = await fixture();
    await callOk(t, token, "claim_task", { taskId }, header);
    await t.run(async (ctx) => {
      for (let i = 0; i < 105; i++)
        await ctx.db.insert("taskHandoffs", {
          userId: token.userId,
          taskId,
          tokenId: token.tokenId,
          agent: "Test",
          sessionId: SESSION,
          ...completed,
          followUpTaskIds: [],
          at: Date.now(),
        });
    });
    await asUser.mutation(api.tasks.remove, { taskId });
    const state = await snapshot(t, taskId);
    expect(state.task).toBeNull();
    expect(state.claims).toHaveLength(0);
    expect(state.handoffs).toHaveLength(5);
    expect(
      await scheduledJobs(t, "taskHandoffs:cleanupDeletedTask"),
    ).toHaveLength(1);
    await t.mutation(internal.taskHandoffs.cleanupDeletedTask, { taskId });
    expect((await snapshot(t, taskId)).handoffs).toHaveLength(0);
  });
});
