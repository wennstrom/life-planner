import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { MAX_ACTIVE_TOKENS } from "../apiTokens";
import { hashToken, isWellFormedToken } from "../lib/mcpAuth";
import { DAY_MS } from "../lib/dates";
import {
  activityRows,
  callError,
  callOk,
  insertToken,
  setupMcp,
} from "./test.helpers";

describe("apiTokens", () => {
  it("returns the plaintext once and stores only its hash", async () => {
    const t = setupMcp();
    const alice = t.withIdentity({ subject: "user_alice" });
    const { tokenId, token } = await alice.action(api.apiTokens.create, {
      name: "Claude Code",
      scope: "read_write",
      expiresInDays: 90,
    });
    expect(isWellFormedToken(token)).toBe(true);

    const row = await t.run(async (ctx) => ctx.db.get(tokenId));
    expect(row?.tokenHash).toBe(await hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token.slice(3));
    expect(row?.prefix).toBe(token.slice(3, 11));
    expect(row?.expiresAt).toBeGreaterThan(Date.now() + 89 * DAY_MS);

    const listed = await alice.query(api.apiTokens.list, {});
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      name: "Claude Code",
      scope: "read_write",
      prefix: token.slice(3, 11),
      revokedAt: null,
      lastUsedAt: null,
    });
    expect(JSON.stringify(listed)).not.toContain(row?.tokenHash);
  });

  it("creates tokens that never expire", async () => {
    const t = setupMcp();
    const alice = t.withIdentity({ subject: "user_alice" });
    await alice.action(api.apiTokens.create, {
      name: "Script",
      scope: "read",
      expiresInDays: null,
    });
    const [listed] = await alice.query(api.apiTokens.list, {});
    expect(listed.expiresAt).toBeNull();
  });

  it("rejects blank names and caps active tokens", async () => {
    const t = setupMcp();
    const alice = t.withIdentity({ subject: "user_alice" });
    await expect(
      alice.action(api.apiTokens.create, {
        name: "  ",
        scope: "read",
        expiresInDays: 30,
      }),
    ).rejects.toThrow("Name the token");

    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) {
      await alice.action(api.apiTokens.create, {
        name: `Token ${i}`,
        scope: "read",
        expiresInDays: 30,
      });
    }
    await expect(
      alice.action(api.apiTokens.create, {
        name: "One too many",
        scope: "read",
        expiresInDays: 30,
      }),
    ).rejects.toThrow(/at most 20 active tokens/);

    const [newest] = await alice.query(api.apiTokens.list, {});
    await alice.mutation(api.apiTokens.revoke, { tokenId: newest._id });
    await alice.action(api.apiTokens.create, {
      name: "Replacement",
      scope: "read",
      expiresInDays: 30,
    });
  });

  it("only lists and revokes the user's own tokens", async () => {
    const t = setupMcp();
    const alice = t.withIdentity({ subject: "user_alice" });
    const bob = t.withIdentity({ subject: "user_bob" });
    const { tokenId } = await alice.action(api.apiTokens.create, {
      name: "Alice's",
      scope: "read",
      expiresInDays: 30,
    });
    expect(await bob.query(api.apiTokens.list, {})).toEqual([]);
    await expect(
      bob.mutation(api.apiTokens.revoke, { tokenId }),
    ).rejects.toThrow("Token not found");
  });

  it("requires sign-in", async () => {
    const t = setupMcp();
    await expect(
      t.action(api.apiTokens.create, {
        name: "Anon",
        scope: "read",
        expiresInDays: 30,
      }),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("token checks on tool calls", () => {
  it("rejects unknown, revoked and expired tokens without logging", async () => {
    const t = setupMcp();
    const revoked = await insertToken(t, { revokedAt: Date.now() - 1000 });
    const expired = await insertToken(t, { expiresAt: Date.now() - 1000 });
    const unknown = { ...revoked, tokenHash: await hashToken("lp_unknown") };
    for (const token of [revoked, expired, unknown]) {
      expect(await callError(t, token, "list_tasks")).toBe(
        "Invalid, revoked or expired token",
      );
    }
    expect(await activityRows(t)).toHaveLength(0);
  });

  it("stops working as soon as it is revoked", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    await callOk(t, token, "list_tasks");
    await t
      .withIdentity({ subject: token.userId })
      .mutation(api.apiTokens.revoke, { tokenId: token.tokenId });
    expect(await callError(t, token, "list_tasks")).toBe(
      "Invalid, revoked or expired token",
    );
  });

  it("lets a read token read but not write, and logs the refusal", async () => {
    const t = setupMcp();
    const token = await insertToken(t, { scope: "read" });
    await callOk(t, token, "list_tasks");
    const error = await callError(t, token, "create_task", { title: "Nope" });
    expect(error).toMatch(/read-only/);

    const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(0);
    const rows = await activityRows(t);
    expect(rows.map((row) => [row.tool, row.ok])).toEqual([
      ["list_tasks", true],
      ["create_task", false],
    ]);
  });

  it("records lastUsedAt at most once a minute", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    await callOk(t, token, "list_tasks");
    const first = await t.run(async (ctx) => ctx.db.get(token.tokenId));
    expect(first?.lastUsedAt).toBeDefined();
    await callOk(t, token, "list_tasks");
    const second = await t.run(async (ctx) => ctx.db.get(token.tokenId));
    expect(second?.lastUsedAt).toBe(first?.lastUsedAt);
  });
});
