import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { resolveUserFromRequest } from "../lib/mcpAuth";
import {
  JSONRPC_ERRORS,
  SUPPORTED_PROTOCOL_VERSIONS,
  handleMessage,
  rpcError,
} from "./protocol";
import type { TokenScope } from "../lib/mcpAuth";
import type { ToolCallOutcome } from "./tools";

// Streamable HTTP transport for the MCP server at /mcp: stateless, JSON
// responses only. See ./protocol.ts for the JSON-RPC handling.

export const MAX_BODY_BYTES = 256 * 1024;

/**
 * Browser origins allowed to call /mcp, from the comma-separated
 * MCP_ALLOWED_ORIGINS environment variable. None by default: agents aren't
 * browsers, and refusing Origin headers blocks DNS-rebinding attacks.
 */
function allowedOrigins(): Array<string> {
  return (process.env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function unauthorized(error?: "invalid_token") {
  const challenge = error
    ? `Bearer realm="life-planner", error="${error}"`
    : `Bearer realm="life-planner"`;
  return json(
    rpcError(
      null,
      JSONRPC_ERRORS.invalidRequest,
      error
        ? "Invalid, revoked or expired token"
        : "Send a Life Planner token as Authorization: Bearer lp_…",
    ),
    401,
    { "WWW-Authenticate": challenge },
  );
}

/** The checks every /mcp request goes through before any MCP handling. */
function rejectOrigin(request: Request): Response | null {
  const origin = request.headers.get("Origin");
  if (origin !== null && !allowedOrigins().includes(origin)) {
    return json(
      rpcError(null, JSONRPC_ERRORS.invalidRequest, "Origin not allowed"),
      403,
    );
  }
  return null;
}

export const handlePost = httpAction(async (ctx, request) => {
  const originRejection = rejectOrigin(request);
  if (originRejection) return originRejection;

  const credential = await resolveUserFromRequest(request);
  if (!credential) return unauthorized();

  const tooLarge = json(
    rpcError(null, JSONRPC_ERRORS.invalidRequest, "Request body is too large"),
    413,
  );
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) return tooLarge;
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) return tooLarge;

  const scope: TokenScope | null = await ctx.runQuery(
    internal.mcp.tools.tokenScope,
    { tokenHash: credential.tokenHash, now: Date.now() },
  );
  if (scope === null) return unauthorized("invalid_token");

  const version = request.headers.get("MCP-Protocol-Version");
  if (
    version !== null &&
    !(SUPPORTED_PROTOCOL_VERSIONS as ReadonlyArray<string>).includes(version)
  ) {
    return json(
      rpcError(
        null,
        JSONRPC_ERRORS.invalidRequest,
        `Unsupported MCP-Protocol-Version: ${version}`,
      ),
      400,
    );
  }

  let message: unknown;
  try {
    message = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json(rpcError(null, JSONRPC_ERRORS.parseError, "Parse error"), 400);
  }
  if (Array.isArray(message)) {
    return json(
      rpcError(null, JSONRPC_ERRORS.invalidRequest, "Batching is not supported"),
      400,
    );
  }

  const response = await handleMessage(message, {
    scope,
    callTool: async (name, args) => {
      try {
        const outcome: ToolCallOutcome = await ctx.runMutation(
          internal.mcp.tools.call,
          { tokenHash: credential.tokenHash, tool: name, input: args },
        );
        return outcome;
      } catch (error) {
        console.error(`MCP tool ${name} failed`, error);
        return { ok: false, error: "Internal error. Try again later." };
      }
    },
  });
  if (response === null) return new Response(null, { status: 202 });
  return json(response);
});

/** GET (SSE stream) and DELETE (end session): this server has neither. */
export const handleUnsupported = httpAction((_ctx, request) =>
  Promise.resolve(
    rejectOrigin(request) ??
      new Response(null, { status: 405, headers: { Allow: "POST" } }),
  ),
);
