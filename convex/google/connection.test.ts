import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { modules } from "../test.setup";

describe("google.connection", () => {
  it("markConnected inserts googleAccounts for the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.google.connection.markConnected, {});

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("googleAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(row?.userId).toBe(userId);
  });

  it("disconnect removes googleAccounts", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.google.connection.markConnected, {});
    await asUser.mutation(api.google.connection.disconnect, {});

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("googleAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(row).toBeNull();
  });

  it("viewer.googleConnected reflects metadata row", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const asUser = t.withIdentity({ subject: userId });

    let viewer = await asUser.query(api.users.viewer, {});
    expect(viewer.googleConnected).toBe(false);

    await asUser.mutation(api.google.connection.markConnected, {});
    viewer = await asUser.query(api.users.viewer, {});
    expect(viewer.googleConnected).toBe(true);
  });
});
