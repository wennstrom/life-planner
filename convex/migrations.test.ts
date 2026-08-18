import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("migrations.dropScheduledDate", () => {
  it("is safe to run on already-migrated backlog tasks", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "a@b.com", name: "A" }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", {
        userId,
        title: "Backlog task",
        status: "backlog",
        order: 0,
      });
    });

    await t.mutation(internal.migrations.dropScheduledDate, {});

    const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("backlog");
  });
});
