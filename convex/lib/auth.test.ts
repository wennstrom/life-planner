import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { getOptionalUserId, requireUserId } from "./auth";

describe("requireUserId", () => {
  it("returns identity.subject for an authenticated caller", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user_test1" });

    const userId = await asUser.run(async (ctx) => requireUserId(ctx));
    expect(userId).toBe("user_test1");
  });

  it("throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => requireUserId(ctx)),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("getOptionalUserId", () => {
  it("returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => getOptionalUserId(ctx));
    expect(userId).toBeNull();
  });
});
