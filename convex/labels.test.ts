import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";
import {
  LABEL_STRIP_BATCH,
  MAX_LABELS_PER_TASK,
  MAX_LABELS_PER_USER,
  normalizeLabelName,
  parseTitlePrefix,
} from "./lib/labels";
import type { Id } from "./_generated/dataModel";

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const t = convexTest(schema, modules);
  const userId = "user_labels";
  const asUser = t.withIdentity({ subject: userId });
  const asOther = t.withIdentity({ subject: "user_other" });
  return { t, userId, asUser, asOther };
}

type T = ReturnType<typeof convexTest>;

async function insertTasks(
  t: T,
  userId: string,
  count: number,
  fields: { labelIds?: Array<Id<"labels">>; title?: (i: number) => string } = {},
) {
  return await t.run(async (ctx) => {
    const ids: Array<Id<"tasks">> = [];
    for (let i = 0; i < count; i++) {
      ids.push(
        await ctx.db.insert("tasks", {
          userId,
          title: fields.title ? fields.title(i) : `Task ${i}`,
          order: i,
          labelIds: fields.labelIds,
        }),
      );
    }
    return ids;
  });
}

describe("label names", () => {
  it("normalises whitespace", () => {
    expect(normalizeLabelName("  Agent   MCP ")).toBe("Agent MCP");
  });

  it("parses [Foo] title prefixes", () => {
    expect(parseTitlePrefix("[Agent MCP] Review column")).toEqual({
      label: "Agent MCP",
      title: "Review column",
    });
    expect(parseTitlePrefix("  [ ui ]   Fix it ")).toEqual({
      label: "ui",
      title: "Fix it",
    });
    expect(parseTitlePrefix("No prefix")).toBeNull();
    expect(parseTitlePrefix("[] empty label")).toBeNull();
    expect(parseTitlePrefix("[Only a label]")).toBeNull();
  });
});

describe("labels CRUD", () => {
  it("creates, lists in order, renames and recolours", async () => {
    const { asUser } = setup();
    const a = await asUser.mutation(api.labels.create, { name: " Agent  MCP " });
    const b = await asUser.mutation(api.labels.create, {
      name: "UI",
      color: "#ec4899",
    });
    let labels = await asUser.query(api.labels.list, {});
    expect(labels.map((l) => [l._id, l.name])).toEqual([
      [a, "Agent MCP"],
      [b, "UI"],
    ]);
    expect(labels[1].color).toBe("#ec4899");

    await asUser.mutation(api.labels.update, {
      labelId: a,
      name: "Agents",
      color: "#22c55e",
    });
    labels = await asUser.query(api.labels.list, {});
    expect(labels[0]).toMatchObject({ name: "Agents", color: "#22c55e" });
  });

  it("rejects duplicate names ignoring case and spacing", async () => {
    const { asUser } = setup();
    const ui = await asUser.mutation(api.labels.create, { name: "UI Work" });
    await expect(
      asUser.mutation(api.labels.create, { name: " ui   work" }),
    ).rejects.toThrow(/already exists/);
    const other = await asUser.mutation(api.labels.create, { name: "Other" });
    await expect(
      asUser.mutation(api.labels.update, { labelId: other, name: "ui work" }),
    ).rejects.toThrow(/already exists/);
    // Renaming a label to its own name in another case is fine.
    await asUser.mutation(api.labels.update, { labelId: ui, name: "ui work" });
  });

  it("rejects empty names, long names and unknown colours", async () => {
    const { asUser } = setup();
    await expect(
      asUser.mutation(api.labels.create, { name: "   " }),
    ).rejects.toThrow(/required/);
    await expect(
      asUser.mutation(api.labels.create, { name: "x".repeat(41) }),
    ).rejects.toThrow(/at most 40/);
    await expect(
      asUser.mutation(api.labels.create, { name: "Red", color: "red" }),
    ).rejects.toThrow(/Invalid label color/);
  });

  it("allows at most 50 labels per user", async () => {
    const { t, userId, asUser, asOther } = setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_LABELS_PER_USER; i++) {
        await ctx.db.insert("labels", {
          userId,
          name: `L${i}`,
          color: "#6366f1",
          order: i,
        });
      }
    });
    await expect(
      asUser.mutation(api.labels.create, { name: "One more" }),
    ).rejects.toThrow(/at most 50 labels/);
    // The cap is per user.
    await asOther.mutation(api.labels.create, { name: "One more" });
  });

  it("only lets the owner change or delete a label", async () => {
    const { asUser, asOther } = setup();
    const labelId = await asUser.mutation(api.labels.create, { name: "Mine" });
    await expect(
      asOther.mutation(api.labels.update, { labelId, name: "Theirs" }),
    ).rejects.toThrow(/Label not found/);
    await expect(
      asOther.mutation(api.labels.remove, { labelId }),
    ).rejects.toThrow(/Label not found/);
    expect(await asOther.query(api.labels.list, {})).toEqual([]);
  });
});

describe("task labels", () => {
  it("sets labels on create and replaces them on update", async () => {
    const { t, asUser } = setup();
    const a = await asUser.mutation(api.labels.create, { name: "A" });
    const b = await asUser.mutation(api.labels.create, { name: "B" });
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Labelled",
      labelIds: [a, b, a],
    });
    const get = () => t.run(async (ctx) => ctx.db.get("tasks", taskId));
    expect((await get())?.labelIds).toEqual([a, b]);

    await asUser.mutation(api.tasks.update, { taskId, labelIds: [b] });
    expect((await get())?.labelIds).toEqual([b]);

    await asUser.mutation(api.tasks.update, { taskId, labelIds: [] });
    expect((await get())?.labelIds).toBeUndefined();
  });

  it("rejects another user's label and more than 10 labels", async () => {
    const { t, userId, asUser, asOther } = setup();
    const theirs = await asOther.mutation(api.labels.create, { name: "Theirs" });
    await expect(
      asUser.mutation(api.tasks.create, { title: "x", labelIds: [theirs] }),
    ).rejects.toThrow(/Label not found/);

    const many = await t.run(async (ctx) => {
      const ids: Array<Id<"labels">> = [];
      for (let i = 0; i <= MAX_LABELS_PER_TASK; i++) {
        ids.push(
          await ctx.db.insert("labels", {
            userId,
            name: `L${i}`,
            color: "#6366f1",
            order: i,
          }),
        );
      }
      return ids;
    });
    await expect(
      asUser.mutation(api.tasks.create, { title: "x", labelIds: many }),
    ).rejects.toThrow(/at most 10 labels/);
    await asUser.mutation(api.tasks.create, {
      title: "ten",
      labelIds: many.slice(0, MAX_LABELS_PER_TASK),
    });
  });

  it("shows labels on board cards", async () => {
    const { asUser } = setup();
    const labelId = await asUser.mutation(api.labels.create, {
      name: "Epic",
      color: "#14b8a6",
    });
    await asUser.mutation(api.tasks.create, { title: "Card", labelIds: [labelId] });
    const board = await asUser.query(api.backlog.board, {});
    const card = board.columns[0].tasks[0];
    expect(card.labels).toEqual([
      { _id: labelId, name: "Epic", color: "#14b8a6" },
    ]);
  });
});

describe("deleting a label", () => {
  it("removes it from tasks in the same transaction for small boards", async () => {
    const { t, userId, asUser } = setup();
    const keep = await asUser.mutation(api.labels.create, { name: "Keep" });
    const gone = await asUser.mutation(api.labels.create, { name: "Gone" });
    const [both, only] = [
      ...(await insertTasks(t, userId, 1, { labelIds: [keep, gone] })),
      ...(await insertTasks(t, userId, 1, { labelIds: [gone] })),
    ];
    await asUser.mutation(api.labels.remove, { labelId: gone });
    const tasks = await t.run(async (ctx) => ({
      both: await ctx.db.get("tasks", both),
      only: await ctx.db.get("tasks", only),
    }));
    expect(tasks.both?.labelIds).toEqual([keep]);
    expect(tasks.only?.labelIds).toBeUndefined();
    expect(await asUser.query(api.labels.list, {})).toHaveLength(1);
  });

  it("continues in scheduled batches for large boards", async () => {
    vi.useFakeTimers();
    const { t, userId, asUser } = setup();
    const labelId = await asUser.mutation(api.labels.create, { name: "Big" });
    const count = LABEL_STRIP_BATCH * 2 + 5;
    await insertTasks(t, userId, count, { labelIds: [labelId] });

    await asUser.mutation(api.labels.remove, { labelId });
    const remaining = async () =>
      (
        await t.run(async (ctx) =>
          ctx.db
            .query("tasks")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect(),
        )
      ).filter((task) => task.labelIds !== undefined).length;
    expect(await remaining()).toBe(count - LABEL_STRIP_BATCH);

    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
    });
    expect(await remaining()).toBe(0);
  });
});

describe("fromTitlePrefixes", () => {
  it("turns [Foo] title into label Foo and title", async () => {
    const { t, userId, asUser } = setup();
    const existing = await asUser.mutation(api.labels.create, {
      name: "Agent MCP",
    });
    const titles = [
      "[agent mcp] Review column",
      "[UI] Board chips",
      "[UI] Settings",
      "Plain task",
    ];
    const ids = await insertTasks(t, userId, titles.length, {
      title: (i) => titles[i],
    });

    const result = await t.mutation(internal.labels.fromTitlePrefixes, {
      userId,
    });
    expect(result).toMatchObject({ renamed: 3, labelsCreated: 1, more: false });

    const labels = await asUser.query(api.labels.list, {});
    expect(labels.map((l) => l.name)).toEqual(["Agent MCP", "UI"]);
    const ui = labels[1]._id;
    const tasks = await t.run(async (ctx) =>
      Promise.all(ids.map((id) => ctx.db.get("tasks", id))),
    );
    expect(tasks.map((task) => [task?.title, task?.labelIds])).toEqual([
      ["Review column", [existing]],
      ["Board chips", [ui]],
      ["Settings", [ui]],
      ["Plain task", undefined],
    ]);

    // Running it again changes nothing.
    const again = await t.mutation(internal.labels.fromTitlePrefixes, {
      userId,
    });
    expect(again).toMatchObject({ renamed: 0, labelsCreated: 0 });
  });

  it("skips tasks whose label can't be created", async () => {
    const { t, userId } = setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_LABELS_PER_USER; i++) {
        await ctx.db.insert("labels", {
          userId,
          name: `L${i}`,
          color: "#6366f1",
          order: i,
        });
      }
    });
    const [taskId] = await insertTasks(t, userId, 1, {
      title: () => "[New] Thing",
    });
    const result = await t.mutation(internal.labels.fromTitlePrefixes, {
      userId,
    });
    expect(result.renamed).toBe(0);
    expect(result.skipped).toHaveLength(1);
    const task = await t.run(async (ctx) => ctx.db.get("tasks", taskId));
    expect(task?.title).toBe("[New] Thing");
  });

  it("processes large boards in scheduled batches", async () => {
    vi.useFakeTimers();
    const { t, userId } = setup();
    await insertTasks(t, userId, 250, { title: (i) => `[Bulk] Task ${i}` });
    const first = await t.mutation(internal.labels.fromTitlePrefixes, {
      userId,
    });
    expect(first).toMatchObject({ renamed: 100, more: true });
    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
    });
    const tasks = await t.run(async (ctx) =>
      ctx.db
        .query("tasks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(tasks.every((task) => !task.title.startsWith("["))).toBe(true);
    expect(new Set(tasks.map((task) => task.labelIds?.[0])).size).toBe(1);
  });
});
