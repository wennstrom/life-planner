import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import { modules } from "./test.setup";
import { toMigratedGoogleAccount } from "./migrateClerkUser";

describe("toMigratedGoogleAccount", () => {
  it("drops legacy OAuth secrets while keeping sync metadata", () => {
    expect(
      toMigratedGoogleAccount(
        {
          userId: "legacy",
          calendarSyncToken: "sync-token",
          watchChannelId: "chan_1",
          watchResourceId: "res_1",
          watchExpiry: 123,
          accessToken: "ya29.legacy",
          refreshToken: "1//legacy",
          tokenExpiry: 456,
        },
        "user_clerk123",
      ),
    ).toEqual({
      userId: "user_clerk123",
      calendarSyncToken: "sync-token",
      watchChannelId: "chan_1",
      watchResourceId: "res_1",
      watchExpiry: 123,
    });
  });

  it("omits absent optional metadata instead of writing undefined", () => {
    const migrated = toMigratedGoogleAccount(
      { userId: "legacy", accessToken: "ya29.legacy" },
      "user_clerk123",
    );
    expect(migrated).toEqual({ userId: "user_clerk123" });
    expect(Object.keys(migrated)).toEqual(["userId"]);
  });
});

describe("migrateClerkUser", () => {
  it("rewrites domain rows from legacy id to Clerk id", async () => {
    const t = convexTest(schema, modules);
    const legacyUserId = "jh7legacy000000000000000000";
    const clerkUserId = "user_clerk123";

    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", {
        userId: legacyUserId,
        title: "Keep me",
        order: 0,
      });
      await ctx.db.insert("projects", {
        userId: legacyUserId,
        name: "Legacy project",
        color: "#fff",
        status: "active",
        order: 0,
        health: "onTrack",
      });
      // The live table may still hold accessToken/refreshToken/tokenExpiry, but
      // the current schema rejects them, so convex-test can only seed the
      // allowed fields. toMigratedGoogleAccount covers the stripping itself.
      await ctx.db.insert("googleAccounts", {
        userId: legacyUserId,
        calendarSyncToken: "sync-token",
      });
    });

    await t.mutation(internal.migrateClerkUser.run, {
      legacyUserId,
      clerkUserId,
    });

    await t.run(async (ctx) => {
      const tasks = await ctx.db.query("tasks").collect();
      expect(tasks[0]?.userId).toBe(clerkUserId);
      const projects = await ctx.db.query("projects").collect();
      expect(projects[0]?.userId).toBe(clerkUserId);
      const accounts = await ctx.db.query("googleAccounts").collect();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.userId).toBe(clerkUserId);
      expect(accounts[0]?.calendarSyncToken).toBe("sync-token");
    });
  });

  it("leaves other users' rows untouched", async () => {
    const t = convexTest(schema, modules);
    const legacyUserId = "jh7legacy000000000000000000";
    const otherUserId = "user_other";

    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", {
        userId: otherUserId,
        title: "Not mine",
        order: 0,
      });
    });

    await t.mutation(internal.migrateClerkUser.run, {
      legacyUserId,
      clerkUserId: "user_clerk123",
    });

    await t.run(async (ctx) => {
      const tasks = await ctx.db.query("tasks").collect();
      expect(tasks[0]?.userId).toBe(otherUserId);
    });
  });

  it("rejects a no-op remap onto the same id", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.migrateClerkUser.run, {
        legacyUserId: "user_clerk123",
        clerkUserId: "user_clerk123",
      }),
    ).rejects.toThrow();
  });
});
