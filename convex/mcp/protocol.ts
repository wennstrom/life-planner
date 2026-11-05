import { isToolName, listToolsForScope } from "./toolDefs";
import type { TokenScope } from "../lib/mcpAuth";
import type { ToolCallOutcome } from "./tools";

// A small, stateless MCP server over JSON-RPC 2.0: initialize, ping,
// tools/list and tools/call. No sessions, no SSE, no batching. The transport
// (Streamable HTTP with JSON responses) is in ./server.ts.

export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_INFO = {
  name: "life-planner",
  title: "Life Planner",
  version: "1.0.0",
};

export const SERVER_INSTRUCTIONS = `Life Planner holds the user's tasks, projects and calendar. You act as the user.

- Call get_context first. It gives the current local time, the user's timezone and today's date.
- Always send times as ISO 8601 with a UTC offset (2026-11-04T09:00:00+01:00). Times without an offset are rejected. Times come back in the user's timezone.
- Look up IDs with list_projects, list_columns, list_tasks and list_calendar before using them. Don't guess IDs.
- Call get_project_context before working on a project's tasks. Its agentContext holds the user's notes for agents on that project.
- Calendar blocks with editable: false are the user's Google Calendar events. They are read-only.
- Tasks can't be deleted. Archive them with archive_task; unarchive_task restores them.
- Moving a task to the done column (see get_context or list_columns) marks it complete.
- If a call fails with a rate limit, it says how many seconds to wait before retrying.`;

export const JSONRPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

type JsonRpcId = string | number | null;

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      error: { code: number; message: string };
    };

export type McpBackend = {
  scope: TokenScope;
  callTool: (name: string, args: unknown) => Promise<ToolCallOutcome>;
};

export function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as ReadonlyArray<string>).includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

export function toolResult(outcome: ToolCallOutcome) {
  if (outcome.ok) {
    return {
      content: [{ type: "text", text: JSON.stringify(outcome.result) }],
      structuredContent: outcome.result,
    };
  }
  const structured: Record<string, unknown> = { error: outcome.error };
  if (outcome.retryAfterMs !== undefined) {
    structured.retryAfterSeconds = Math.max(
      1,
      Math.ceil(outcome.retryAfterMs / 1000),
    );
  }
  return {
    content: [{ type: "text", text: outcome.error }],
    structuredContent: structured,
    isError: true,
  };
}

/**
 * Handles one JSON-RPC message. Returns the response, or null for
 * notifications and client responses, which get no reply.
 */
export async function handleMessage(
  message: unknown,
  backend: McpBackend,
): Promise<JsonRpcResponse | null> {
  if (!isObject(message) || message.jsonrpc !== "2.0") {
    return rpcError(null, JSONRPC_ERRORS.invalidRequest, "Invalid request");
  }
  const { method } = message;

  // A response to a server request, which this server never sends.
  if (method === undefined && ("result" in message || "error" in message)) {
    return null;
  }
  if (typeof method !== "string") {
    return rpcError(
      isValidId(message.id) ? message.id : null,
      JSONRPC_ERRORS.invalidRequest,
      "Invalid request",
    );
  }
  // Notifications (no id), e.g. notifications/initialized, need no reply.
  if (!("id" in message)) return null;
  if (!isValidId(message.id)) {
    return rpcError(null, JSONRPC_ERRORS.invalidRequest, "Invalid request id");
  }
  const id = message.id;
  const params = isObject(message.params) ? message.params : {};

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiateProtocolVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: SERVER_INSTRUCTIONS,
        },
      };
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: listToolsForScope(backend.scope) },
      };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !isToolName(name)) {
        return rpcError(
          id,
          JSONRPC_ERRORS.invalidParams,
          `Unknown tool: ${typeof name === "string" ? name : "(none)"}`,
        );
      }
      const args = params.arguments ?? {};
      const outcome = await backend.callTool(name, args);
      return { jsonrpc: "2.0", id, result: toolResult(outcome) };
    }
    default:
      return rpcError(
        id,
        JSONRPC_ERRORS.methodNotFound,
        `Method not found: ${method}`,
      );
  }
}
