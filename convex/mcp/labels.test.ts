import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { listToolsForScope } from "./toolDefs";
import { callError, callOk, insertToken, setupMcp } from "./test.helpers";
import type { McpTest, TestToken } from "./test.helpers";

async function seedLabels(t: McpTest, token: TestToken) {
  const asUser = t.withIdentity({ subject: token.userId });
  const epic = await asUser.mutation(api.labels.create, {
    name: "Agent MCP",
    color: "#3b82f6",
  });
  const ui = await asUser.mutation(api.labels.create, { name: "UI" });
  return { asUser, epic, ui };
}

describe("list_labels", () => {
  it("is a read tool listing the user's labels in order", async () => {
    const t = setupMcp();
    const token = await insertToken(t, { scope: "read" });
    const { epic, ui } = await seedLabels(t, token);
    await t
      .withIdentity({ subject: "user_bob" })
      .mutation(api.labels.create, { name: "Bob's" });

    expect(listToolsForScope("read").map((tool) => tool.name)).toContain(
      "list_labels",
    );
    const result = await callOk(t, token, "list_labels");
    expect(result.labels).toEqual([
      { id: epic, name: "Agent MCP", color: "#3b82f6" },
      { id: ui, name: "UI", color: expect.any(String) },
    ]);
  });
});

describe("labels on tasks", () => {
  it("sets labels on create_task and replaces them on update_task", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const { epic, ui } = await seedLabels(t, token);

    const created = await callOk(t, token, "create_task", {
      title: "Review column",
      labelIds: [epic],
    });
    expect(created.task.labelIds).toEqual([epic]);
    const taskId = created.task.id;

    const updated = await callOk(t, token, "update_task", {
      taskId,
      labelIds: [ui, epic],
    });
    expect(updated.task.labelIds).toEqual([ui, epic]);

    const detail = await callOk(t, token, "get_task", { taskId });
    expect(detail.task.labels).toEqual([
      { id: ui, name: "UI" },
      { id: epic, name: "Agent MCP" },
    ]);

    // Other fields leave labels alone; [] clears them.
    await callOk(t, token, "update_task", { taskId, title: "Renamed" });
    expect(
      (await callOk(t, token, "get_task", { taskId })).task.labelIds,
    ).toEqual([ui, epic]);
    const cleared = await callOk(t, token, "update_task", {
      taskId,
      labelIds: [],
    });
    expect(cleared.task.labelIds).toEqual([]);
  });

  it("rejects unknown, foreign and too many labels", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    await seedLabels(t, token);
    const foreign = await t
      .withIdentity({ subject: "user_bob" })
      .mutation(api.labels.create, { name: "Bob's" });

    expect(
      await callError(t, token, "create_task", {
        title: "x",
        labelIds: ["not-an-id"],
      }),
    ).toBe("Label not found");
    expect(
      await callError(t, token, "create_task", {
        title: "x",
        labelIds: [foreign],
      }),
    ).toBe("Label not found");
    expect(
      await callError(t, token, "create_task", {
        title: "x",
        labelIds: Array.from({ length: 11 }, () => foreign),
      }),
    ).toMatch(/^Invalid arguments: labelIds/);
  });

  it("filters list_tasks by labelId", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const { epic, ui } = await seedLabels(t, token);
    await callOk(t, token, "create_task", { title: "A", labelIds: [epic] });
    await callOk(t, token, "create_task", { title: "B", labelIds: [epic, ui] });
    await callOk(t, token, "create_task", { title: "C" });

    const byEpic = await callOk(t, token, "list_tasks", { labelId: epic });
    expect(byEpic.tasks.map((task: { title: string }) => task.title)).toEqual([
      "A",
      "B",
    ]);
    const byUi = await callOk(t, token, "list_tasks", { labelId: ui });
    expect(byUi.total).toBe(1);

    const foreign = await t
      .withIdentity({ subject: "user_bob" })
      .mutation(api.labels.create, { name: "Bob's" });
    expect(
      await callError(t, token, "list_tasks", { labelId: foreign }),
    ).toBe("Label not found");
  });

  it("drops a deleted label from get_task", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const { asUser, epic } = await seedLabels(t, token);
    const created = await callOk(t, token, "create_task", {
      title: "A",
      labelIds: [epic],
    });
    await asUser.mutation(api.labels.remove, { labelId: epic });
    const detail = await callOk(t, token, "get_task", {
      taskId: created.task.id,
    });
    expect(detail.task.labels).toEqual([]);
    expect(detail.task.labelIds).toEqual([]);
  });
});
