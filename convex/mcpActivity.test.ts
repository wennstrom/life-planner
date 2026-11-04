import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ACTIVITY_LIST_LIMIT } from "./mcpActivity";
import { callOk, insertToken, setupMcp } from "./mcp/test.helpers";

describe("mcpActivity.listForToken", () => {
  it("lists the token's calls newest first, capped", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    await callOk(t, token, "list_tasks");
    await callOk(t, token, "create_task", { title: "Logged" });
    const asUser = t.withIdentity({ subject: token.userId });

    const rows = await asUser.query(api.mcpActivity.listForToken, {
      tokenId: token.tokenId,
    });
    expect(rows.map((row) => row.tool)).toEqual(["create_task", "list_tasks"]);
    expect(rows[0]).toMatchObject({ ok: true, summary: "Created 'Logged'" });

    await t.run(async (ctx) => {
      for (let i = 0; i < ACTIVITY_LIST_LIMIT + 5; i++) {
        await ctx.db.insert("mcpActivity", {
          userId: token.userId,
          tokenId: token.tokenId,
          tool: "list_tasks",
          ok: true,
          summary: "Listed 0 tasks",
          targetIds: [],
          at: Date.now() + i,
        });
      }
    });
    expect(
      await asUser.query(api.mcpActivity.listForToken, {
        tokenId: token.tokenId,
      }),
    ).toHaveLength(ACTIVITY_LIST_LIMIT);
  });

  it("hides other users' token activity", async () => {
    const t = setupMcp();
    const token = await insertToken(t, { userId: "user_alice" });
    await expect(
      t
        .withIdentity({ subject: "user_bob" })
        .query(api.mcpActivity.listForToken, { tokenId: token.tokenId }),
    ).rejects.toThrow("Token not found");
  });
});
