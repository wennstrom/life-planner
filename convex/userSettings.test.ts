import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

function setup() {
  const t = convexTest(schema, modules);
  return {
    t,
    alice: t.withIdentity({ subject: "user_alice" }),
    bob: t.withIdentity({ subject: "user_bob" }),
  };
}

async function settingsRows(t: ReturnType<typeof setup>["t"]) {
  return t.run(async (ctx) => ctx.db.query("userSettings").collect());
}

describe("userSettings", () => {
  it("returns null before a timezone is saved", async () => {
    const { alice } = setup();
    expect(await alice.query(api.userSettings.get, {})).toEqual({
      timezone: null,
      agentsCanMarkDone: false,
    });
  });

  it("saves and returns the timezone", async () => {
    const { alice } = setup();
    await alice.mutation(api.userSettings.setTimezone, {
      timezone: "Europe/Stockholm",
    });
    expect(await alice.query(api.userSettings.get, {})).toEqual({
      timezone: "Europe/Stockholm",
      agentsCanMarkDone: false,
    });
  });

  it("rejects a zone the runtime doesn't know", async () => {
    const { t, alice } = setup();
    for (const timezone of ["Mars/Olympus", "", "not a zone"]) {
      await expect(
        alice.mutation(api.userSettings.setTimezone, { timezone }),
      ).rejects.toThrow("Invalid timezone");
    }
    expect(await settingsRows(t)).toHaveLength(0);
  });

  it("doesn't write when the zone is unchanged", async () => {
    const { t, alice } = setup();
    await alice.mutation(api.userSettings.setTimezone, {
      timezone: "Europe/Stockholm",
    });
    const [first] = await settingsRows(t);
    await alice.mutation(api.userSettings.setTimezone, {
      timezone: "Europe/Stockholm",
    });
    const rows = await settingsRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].updatedAt).toBe(first.updatedAt);
  });

  it("updates the existing row when the zone changes", async () => {
    const { t, alice } = setup();
    await alice.mutation(api.userSettings.setTimezone, {
      timezone: "Europe/Stockholm",
    });
    await alice.mutation(api.userSettings.setTimezone, {
      timezone: "America/New_York",
    });
    const rows = await settingsRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].timezone).toBe("America/New_York");
  });

  it("keeps each user's zone separate", async () => {
    const { alice, bob } = setup();
    await alice.mutation(api.userSettings.setTimezone, {
      timezone: "Europe/Stockholm",
    });
    expect(await bob.query(api.userSettings.get, {})).toEqual({
      timezone: null,
      agentsCanMarkDone: false,
    });
    await bob.mutation(api.userSettings.setTimezone, {
      timezone: "Asia/Tokyo",
    });
    expect(await alice.query(api.userSettings.get, {})).toEqual({
      timezone: "Europe/Stockholm",
      agentsCanMarkDone: false,
    });
  });

  it("requires sign-in", async () => {
    const { t } = setup();
    await expect(t.query(api.userSettings.get, {})).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("toggles agentsCanMarkDone per user, keeping the timezone", async () => {
    const { t, alice, bob } = setup();
    await alice.mutation(api.userSettings.setTimezone, {
      timezone: "Europe/Stockholm",
    });
    await alice.mutation(api.userSettings.setAgentsCanMarkDone, {
      value: true,
    });
    expect(await alice.query(api.userSettings.get, {})).toEqual({
      timezone: "Europe/Stockholm",
      agentsCanMarkDone: true,
    });
    expect(
      (await bob.query(api.userSettings.get, {})).agentsCanMarkDone,
    ).toBe(false);

    await bob.mutation(api.userSettings.setAgentsCanMarkDone, { value: true });
    await alice.mutation(api.userSettings.setAgentsCanMarkDone, {
      value: false,
    });
    expect(
      (await alice.query(api.userSettings.get, {})).agentsCanMarkDone,
    ).toBe(false);
    expect(
      (await bob.query(api.userSettings.get, {})).agentsCanMarkDone,
    ).toBe(true);
    expect(await settingsRows(t)).toHaveLength(2);
  });

  it("requires sign-in to change agentsCanMarkDone", async () => {
    const { t } = setup();
    await expect(
      t.mutation(api.userSettings.setAgentsCanMarkDone, { value: true }),
    ).rejects.toThrow();
  });
});
