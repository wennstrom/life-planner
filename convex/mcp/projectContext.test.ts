import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { OPEN_TASK_SCAN_LIMIT } from "../lib/projectOps";
import { SERVER_INSTRUCTIONS } from "./protocol";
import { activityRows, callError, callOk, insertToken, setupMcp } from "./test.helpers";

async function setup() {
  const t = setupMcp();
  const token = await insertToken(t, { scope: "read" });
  const asUser = t.withIdentity({ subject: token.userId });
  await asUser.mutation(api.boardColumns.ensureDefaults, {});
  const columns = await asUser.query(api.boardColumns.list, {});
  const done = columns.find((column) => column.isDone)!;
  const projectId = await asUser.mutation(api.projects.create, {
    name: "Launch",
    description: "Ship the site",
    color: "#3b82f6",
    health: "atRisk",
    healthNote: "waiting on DNS",
    goalDate: "2026-12-01",
  });
  return { t, token, asUser, projectId, doneColumnId: done._id };
}

describe("get_project_context", () => {
  it("returns the project's agent context, health, goal and open task count", async () => {
    const { t, token, asUser, projectId, doneColumnId } = await setup();
    await asUser.mutation(api.projects.setAgentContext, {
      projectId,
      agentContext: "# Launch\nRepo: ~/code/launch. Secrets: 1Password vault 'Launch'.",
    });
    await t.run(async (ctx) => {
      const base = { userId: token.userId, projectId, order: 0 };
      await ctx.db.insert("tasks", { ...base, title: "Open" });
      await ctx.db.insert("tasks", { ...base, title: "Also open" });
      await ctx.db.insert("tasks", { ...base, title: "Done", columnId: doneColumnId });
      await ctx.db.insert("tasks", { ...base, title: "Archived", archived: true });
      // Another user's task pointing at this project doesn't count.
      await ctx.db.insert("tasks", { ...base, userId: "user_bob", title: "Not mine" });
    });

    const result = await callOk(t, token, "get_project_context", { projectId });
    expect(result.project).toEqual({
      id: projectId,
      name: "Launch",
      description: "Ship the site",
      status: "active",
      agentContext:
        "# Launch\nRepo: ~/code/launch. Secrets: 1Password vault 'Launch'.",
      health: "atRisk",
      healthNote: "waiting on DNS",
      goalDate: "2026-12-01",
      openTaskCount: 2,
      openTaskCountCapped: false,
    });

    const rows = await activityRows(t);
    expect(rows.at(-1)).toMatchObject({
      tool: "get_project_context",
      ok: true,
      summary: "Read context for 'Launch'",
      targetIds: [projectId],
    });
  });

  it("returns nulls for a project without context", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const projectId = await t
      .withIdentity({ subject: token.userId })
      .mutation(api.projects.create, { name: "Bare", color: "#3b82f6" });

    const { project } = await callOk(t, token, "get_project_context", { projectId });
    expect(project).toMatchObject({
      agentContext: null,
      description: null,
      health: null,
      goalDate: null,
      openTaskCount: 0,
      openTaskCountCapped: false,
    });
  });

  it("caps the open task count", async () => {
    const { t, token, projectId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i <= OPEN_TASK_SCAN_LIMIT; i++) {
        await ctx.db.insert("tasks", {
          userId: token.userId,
          projectId,
          title: `Task ${i}`,
          order: i,
        });
      }
    });
    const { project } = await callOk(t, token, "get_project_context", { projectId });
    expect(project.openTaskCount).toBe(OPEN_TASK_SCAN_LIMIT);
    expect(project.openTaskCountCapped).toBe(true);
  });

  it("treats unknown, malformed and other users' project IDs as not found", async () => {
    const { t, projectId } = await setup();
    const bob = await insertToken(t, { userId: "user_bob" });
    expect(await callError(t, bob, "get_project_context", { projectId })).toBe(
      "Project not found",
    );
    expect(
      await callError(t, bob, "get_project_context", { projectId: "nope" }),
    ).toBe("Project not found");
    expect(await callError(t, bob, "get_project_context", {})).toMatch(
      /Invalid arguments: projectId/,
    );
  });
});

describe("list_projects", () => {
  it("says which projects have agent context", async () => {
    const { t, token, asUser, projectId } = await setup();
    const bareId = await asUser.mutation(api.projects.create, {
      name: "Bare",
      color: "#3b82f6",
    });
    await asUser.mutation(api.projects.setAgentContext, {
      projectId,
      agentContext: "Notes",
    });

    const { projects } = await callOk(t, token, "list_projects");
    expect(
      projects.map((p: { id: string; hasAgentContext: boolean }) => [
        p.id,
        p.hasAgentContext,
      ]),
    ).toEqual([
      [projectId, true],
      [bareId, false],
    ]);
  });
});

describe("server instructions", () => {
  it("tell agents to read project context first", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(
      /get_project_context before working on a project's tasks/,
    );
  });
});
