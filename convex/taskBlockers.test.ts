import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import {
  MAX_BLOCKERS_PER_TASK,
  MAX_BLOCKER_CHAIN_DEPTH,
  openBlockersForTask,
} from "./lib/taskBlockers";
import type { Id } from "./_generated/dataModel";

function setup() {
  const t = convexTest(schema, modules);
  const userId = "user_alice";
  const asUser = t.withIdentity({ subject: userId });
  const create = (title: string) => asUser.mutation(api.tasks.create, { title });
  return { t, userId, asUser, create };
}

async function edgeCount(t: ReturnType<typeof convexTest>) {
  return (await t.run(async (ctx) => ctx.db.query("taskBlockers").collect()))
    .length;
}

describe("taskBlockers.add", () => {
  it("links two tasks and lists both directions", async () => {
    const { asUser, create } = setup();
    const ship = await create("Ship");
    const spec = await create("Write spec");
    await asUser.mutation(api.taskBlockers.add, {
      taskId: ship,
      blockerTaskId: spec,
    });

    expect(
      await asUser.query(api.taskBlockers.listForTask, { taskId: ship }),
    ).toEqual({
      blockedBy: [
        {
          taskId: spec,
          title: "Write spec",
          open: true,
          done: false,
          archived: false,
        },
      ],
      blocking: [],
    });
    expect(
      await asUser.query(api.taskBlockers.listForTask, { taskId: spec }),
    ).toEqual({
      blockedBy: [],
      blocking: [{ taskId: ship, title: "Ship" }],
    });
  });

  it("rejects self-edges, duplicates and other users' tasks", async () => {
    const { t, asUser, create } = setup();
    const a = await create("A");
    const b = await create("B");
    const foreign = await t
      .withIdentity({ subject: "user_bob" })
      .mutation(api.tasks.create, { title: "Bob's" });

    await expect(
      asUser.mutation(api.taskBlockers.add, { taskId: a, blockerTaskId: a }),
    ).rejects.toThrow("A task can't block itself");
    await asUser.mutation(api.taskBlockers.add, { taskId: a, blockerTaskId: b });
    await expect(
      asUser.mutation(api.taskBlockers.add, { taskId: a, blockerTaskId: b }),
    ).rejects.toThrow("'A' is already blocked by 'B'");
    await expect(
      asUser.mutation(api.taskBlockers.add, {
        taskId: a,
        blockerTaskId: foreign,
      }),
    ).rejects.toThrow("Blocker task not found");
    await expect(
      asUser.mutation(api.taskBlockers.add, {
        taskId: foreign,
        blockerTaskId: a,
      }),
    ).rejects.toThrow("Task not found");
    await expect(
      t
        .withIdentity({ subject: "user_bob" })
        .query(api.taskBlockers.listForTask, { taskId: a }),
    ).rejects.toThrow("Task not found");
    expect(await edgeCount(t)).toBe(1);
  });

  it("rejects direct and indirect cycles", async () => {
    const { asUser, create } = setup();
    const a = await create("A");
    const b = await create("B");
    const c = await create("C");
    // A waits on B, B waits on C.
    await asUser.mutation(api.taskBlockers.add, { taskId: a, blockerTaskId: b });
    await asUser.mutation(api.taskBlockers.add, { taskId: b, blockerTaskId: c });

    await expect(
      asUser.mutation(api.taskBlockers.add, { taskId: b, blockerTaskId: a }),
    ).rejects.toThrow("That would make a cycle: 'A' already waits on 'B'");
    await expect(
      asUser.mutation(api.taskBlockers.add, { taskId: c, blockerTaskId: a }),
    ).rejects.toThrow("That would make a cycle");
    // A diamond is fine.
    await asUser.mutation(api.taskBlockers.add, { taskId: a, blockerTaskId: c });
  });

  it("caps blockers per task", async () => {
    const { t, asUser, create } = setup();
    const target = await create("Target");
    for (let i = 0; i < MAX_BLOCKERS_PER_TASK; i++) {
      const blocker = await create(`Blocker ${i}`);
      await asUser.mutation(api.taskBlockers.add, {
        taskId: target,
        blockerTaskId: blocker,
      });
    }
    const extra = await create("One too many");
    await expect(
      asUser.mutation(api.taskBlockers.add, {
        taskId: target,
        blockerTaskId: extra,
      }),
    ).rejects.toThrow(`at most ${MAX_BLOCKERS_PER_TASK} blockers`);
    expect(await edgeCount(t)).toBe(MAX_BLOCKERS_PER_TASK);
  });

  it("refuses chains deeper than the cycle check follows", async () => {
    const { asUser, create } = setup();
    const chain: Array<Id<"tasks">> = [];
    for (let i = 0; i <= MAX_BLOCKER_CHAIN_DEPTH; i++) {
      chain.push(await create(`Step ${i}`));
    }
    // chain[i] waits on chain[i + 1].
    for (let i = 0; i < chain.length - 1; i++) {
      await asUser.mutation(api.taskBlockers.add, {
        taskId: chain[i],
        blockerTaskId: chain[i + 1],
      });
    }
    const head = await create("Head");
    await expect(
      asUser.mutation(api.taskBlockers.add, {
        taskId: head,
        blockerTaskId: chain[0],
      }),
    ).rejects.toThrow(`at most ${MAX_BLOCKER_CHAIN_DEPTH} tasks deep`);
  });
});

describe("taskBlockers.remove", () => {
  it("removes an edge and reports whether there was one", async () => {
    const { t, asUser, create } = setup();
    const a = await create("A");
    const b = await create("B");
    await asUser.mutation(api.taskBlockers.add, { taskId: a, blockerTaskId: b });
    expect(
      await asUser.mutation(api.taskBlockers.remove, {
        taskId: a,
        blockerTaskId: b,
      }),
    ).toBe(true);
    expect(
      await asUser.mutation(api.taskBlockers.remove, {
        taskId: a,
        blockerTaskId: b,
      }),
    ).toBe(false);
    expect(await edgeCount(t)).toBe(0);
  });
});

describe("open blockers", () => {
  it("counts blockers that are neither done nor archived", async () => {
    const { t, userId, asUser, create } = setup();
    const columns = await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const done = columns.find((column) => column.isDone)!;
    const target = await create("Target");
    const open = await create("Open");
    const finished = await create("Finished");
    const shelved = await create("Shelved");
    for (const blocker of [open, finished, shelved]) {
      await asUser.mutation(api.taskBlockers.add, {
        taskId: target,
        blockerTaskId: blocker,
      });
    }
    await asUser.mutation(api.tasks.update, {
      taskId: finished,
      columnId: done._id,
    });
    await asUser.mutation(api.tasks.update, { taskId: shelved, archived: true });

    const blockers = await t.run(async (ctx) =>
      openBlockersForTask(ctx, userId, target),
    );
    expect(blockers.map((task) => task.title)).toEqual(["Open"]);

    const board = await asUser.query(api.backlog.board, {});
    const cards = board.columns.flatMap((column) => column.tasks);
    expect(cards.find((task) => task._id === target)?.openBlockerCount).toBe(
      1,
    );
    expect(cards.find((task) => task._id === open)?.openBlockerCount).toBe(0);

    await asUser.mutation(api.tasks.update, { taskId: open, columnId: done._id });
    const after = await asUser.query(api.backlog.board, {});
    expect(
      after.columns
        .flatMap((column) => column.tasks)
        .find((task) => task._id === target)?.openBlockerCount,
    ).toBe(0);
  });
});

describe("deleting a task", () => {
  it("removes its blocker edges in both directions", async () => {
    const { t, asUser, create } = setup();
    const a = await create("A");
    const b = await create("B");
    const c = await create("C");
    await asUser.mutation(api.taskBlockers.add, { taskId: a, blockerTaskId: b });
    await asUser.mutation(api.taskBlockers.add, { taskId: b, blockerTaskId: c });
    await asUser.mutation(api.taskBlockers.add, { taskId: a, blockerTaskId: c });

    await asUser.mutation(api.tasks.remove, { taskId: b });
    const left = await t.run(async (ctx) =>
      ctx.db.query("taskBlockers").collect(),
    );
    expect(left.map((edge) => [edge.taskId, edge.blockerTaskId])).toEqual([
      [a, c],
    ]);
  });
});
