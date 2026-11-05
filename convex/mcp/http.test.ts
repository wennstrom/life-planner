import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES } from "./server";
import { LATEST_PROTOCOL_VERSION } from "./protocol";
import { activityRows, bearer, insertToken, mcpFetch, setupMcp } from "./test.helpers";

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
};

const toolsList = { jsonrpc: "2.0", id: 2, method: "tools/list" };

describe("/mcp HTTP layer", () => {
  it("returns 401 with a Bearer challenge for missing or malformed tokens", async () => {
    const t = setupMcp();
    const cases: Array<Record<string, string>> = [
      {},
      { Authorization: "Basic abc" },
      { Authorization: "Bearer not-a-token" },
      { Authorization: "Bearer lp_short" },
    ];
    for (const headers of cases) {
      const response = await mcpFetch(t, initialize, headers);
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toMatch(/^Bearer/);
    }
  });

  it("returns 401 for unknown, revoked and expired tokens", async () => {
    const t = setupMcp();
    const revoked = await insertToken(t, { revokedAt: Date.now() - 1 });
    const expired = await insertToken(t, { expiresAt: Date.now() - 1 });
    const unknown = {
      ...revoked,
      token: `lp_${"A".repeat(43)}`,
    };
    for (const token of [revoked, expired, unknown]) {
      const response = await mcpFetch(t, initialize, bearer(token));
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain(
        'error="invalid_token"',
      );
    }
  });

  it("returns 403 for a browser Origin that isn't allowed", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const response = await mcpFetch(t, initialize, {
      ...bearer(token),
      Origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
  });

  it("returns 405 for GET and DELETE", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    for (const method of ["GET", "DELETE"]) {
      const response = await t.fetch("/mcp", { method, headers: bearer(token) });
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
    }
  });

  it("returns 413 for bodies over 256 KB", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const body = JSON.stringify({
      ...toolsList,
      params: { padding: "x".repeat(MAX_BODY_BYTES) },
    });
    const response = await mcpFetch(t, body, bearer(token));
    expect(response.status).toBe(413);
  });

  it("returns 400 for invalid JSON and batches", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    expect((await mcpFetch(t, "{nope", bearer(token))).status).toBe(400);
    expect((await mcpFetch(t, [toolsList], bearer(token))).status).toBe(400);
  });

  it("initializes, accepts the initialized notification and pings", async () => {
    const t = setupMcp();
    const token = await insertToken(t);

    const response = await mcpFetch(t, initialize, bearer(token));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = await response.json();
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "life-planner" },
      },
    });
    expect(body.result.instructions).toMatch(/get_context/);
    expect(body.result.instructions).toMatch(/UTC offset/);

    const unknownVersion = await mcpFetch(
      t,
      { ...initialize, params: { ...initialize.params, protocolVersion: "1999-01-01" } },
      bearer(token),
    );
    expect((await unknownVersion.json()).result.protocolVersion).toBe(
      LATEST_PROTOCOL_VERSION,
    );

    const notification = await mcpFetch(
      t,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { ...bearer(token), "MCP-Protocol-Version": "2025-06-18" },
    );
    expect(notification.status).toBe(202);

    const ping = await mcpFetch(
      t,
      { jsonrpc: "2.0", id: 3, method: "ping" },
      bearer(token),
    );
    expect(await ping.json()).toEqual({ jsonrpc: "2.0", id: 3, result: {} });
  });

  it("lists only read tools for a read token", async () => {
    const t = setupMcp();
    const reader = await insertToken(t, { scope: "read" });
    const writer = await insertToken(t, { scope: "read_write" });

    const readTools = (
      await (await mcpFetch(t, toolsList, bearer(reader))).json()
    ).result.tools.map((tool: { name: string }) => tool.name);
    const allTools = (
      await (await mcpFetch(t, toolsList, bearer(writer))).json()
    ).result.tools;

    expect(readTools).toEqual([
      "get_context",
      "list_tasks",
      "get_task",
      "list_projects",
      "get_project_context",
      "list_columns",
      "list_calendar",
    ]);
    expect(allTools.map((tool: { name: string }) => tool.name)).toContain(
      "schedule_task",
    );
    const createBlock = allTools.find(
      (tool: { name: string }) => tool.name === "create_block",
    );
    expect(createBlock.inputSchema).toMatchObject({
      type: "object",
      required: ["title", "start", "end"],
    });
    expect(createBlock.annotations.readOnlyHint).toBe(false);
  });

  it("round-trips tools/call, with tool errors as isError results", async () => {
    const t = setupMcp();
    const token = await insertToken(t);
    const call = (id: number, name: string, args: unknown) =>
      mcpFetch(
        t,
        { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
        bearer(token),
      ).then((response) => response.json());

    const created = await call(1, "create_task", { title: "From HTTP" });
    expect(created.result.isError).toBeUndefined();
    expect(created.result.structuredContent.task.title).toBe("From HTTP");
    expect(JSON.parse(created.result.content[0].text)).toEqual(
      created.result.structuredContent,
    );

    const failed = await call(2, "get_task", { taskId: "nope" });
    expect(failed.result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "Task not found" }],
    });

    const unknown = await call(3, "delete_task", { taskId: "x" });
    expect(unknown.error.code).toBe(-32602);

    const method = await mcpFetch(
      t,
      { jsonrpc: "2.0", id: 4, method: "resources/list" },
      bearer(token),
    );
    expect((await method.json()).error.code).toBe(-32601);

    expect((await activityRows(t)).map((row) => row.tool)).toEqual([
      "create_task",
      "get_task",
    ]);
  });
});
