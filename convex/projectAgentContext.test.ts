import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { AGENT_CONTEXT_MAX_LENGTH } from "./lib/agentContext";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user_test1" });
  const projectId = await asUser.mutation(api.projects.create, {
    name: "Launch",
    color: "#3b82f6",
  });
  const stored = async () =>
    (await t.run(async (ctx) => ctx.db.get("projects", projectId)))
      ?.agentContext;
  return { t, asUser, projectId, stored };
}

describe("projects.setAgentContext", () => {
  it("stores trimmed markdown and clears it with an empty string", async () => {
    const { asUser, projectId, stored } = await setup();

    await asUser.mutation(api.projects.setAgentContext, {
      projectId,
      agentContext: "  Repo: ~/code/launch\n\n- Run `bun test`  \n",
    });
    expect(await stored()).toBe("Repo: ~/code/launch\n\n- Run `bun test`");
    const { project } = await asUser.query(api.projects.get, { projectId });
    expect(project.agentContext).toBe("Repo: ~/code/launch\n\n- Run `bun test`");

    await asUser.mutation(api.projects.setAgentContext, {
      projectId,
      agentContext: "   ",
    });
    expect(await stored()).toBeUndefined();
  });

  it("accepts exactly the limit and rejects one character more", async () => {
    const { asUser, projectId, stored } = await setup();
    const atLimit = "x".repeat(AGENT_CONTEXT_MAX_LENGTH);

    await asUser.mutation(api.projects.setAgentContext, {
      projectId,
      agentContext: atLimit,
    });
    expect(await stored()).toBe(atLimit);

    await expect(
      asUser.mutation(api.projects.setAgentContext, {
        projectId,
        agentContext: `${atLimit}y`,
      }),
    ).rejects.toThrow(/at most 10,000 characters/);
    expect(await stored()).toBe(atLimit);
  });

  it("refuses another user's project", async () => {
    const { t, projectId, stored } = await setup();
    await expect(
      t
        .withIdentity({ subject: "user_mallory" })
        .mutation(api.projects.setAgentContext, {
          projectId,
          agentContext: "mine now",
        }),
    ).rejects.toThrow(/Project not found/);
    expect(await stored()).toBeUndefined();
  });

  it("survives a project update that clears other fields", async () => {
    const { asUser, projectId, stored } = await setup();
    await asUser.mutation(api.projects.setAgentContext, {
      projectId,
      agentContext: "Keep me",
    });
    await asUser.mutation(api.projects.update, {
      projectId,
      description: "",
      goalDate: null,
    });
    expect(await stored()).toBe("Keep me");
  });
});
