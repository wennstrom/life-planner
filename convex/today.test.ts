import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("today day records", () => {
  it("returns null dayRecord when the day has no saved state", async () => {
    const { asUser } = await createAuthedTest();

    const today = await asUser.query(api.today.get, {});

    expect(today.dayRecord).toBeNull();
  });

  it("saves and returns the day's intention", async () => {
    const { asUser } = await createAuthedTest();

    await asUser.mutation(api.today.saveIntention, {
      intention: "Protect the morning for deep work.",
    });

    const today = await asUser.query(api.today.get, {});
    expect(today.dayRecord?.intention).toBe(
      "Protect the morning for deep work.",
    );
    expect(today.dayRecord?.shutdownCompletedAt).toBeUndefined();
  });

  it("stores shutdown completion on the current day record", async () => {
    const { asUser } = await createAuthedTest();

    await asUser.mutation(api.today.saveIntention, {
      intention: "Finish the auth refactor.",
    });
    await asUser.mutation(api.today.completeShutdown, {
      note: "Wrapped auth refactor, next is test cleanup.",
    });

    const today = await asUser.query(api.today.get, {});
    expect(today.dayRecord?.intention).toBe("Finish the auth refactor.");
    expect(today.dayRecord?.shutdownNote).toBe(
      "Wrapped auth refactor, next is test cleanup.",
    );
    expect(today.dayRecord?.shutdownCompletedAt).toEqual(expect.any(Number));
  });
});
