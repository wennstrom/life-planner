import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { handlePost, handleUnsupported } from "./mcp/server";

const http = httpRouter();

http.route({
  path: "/google/calendar/push",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const channelId = request.headers.get("X-Goog-Channel-ID") ?? undefined;
    const resourceId = request.headers.get("X-Goog-Resource-ID") ?? undefined;

    await ctx.runAction(internal.google.watch.handlePush, {
      channelId,
      resourceId,
    });

    return new Response(null, { status: 200 });
  }),
});

// MCP server for agents (Claude Code, Cursor, Codex …). See convex/mcp/.
http.route({ path: "/mcp", method: "POST", handler: handlePost });
http.route({ path: "/mcp", method: "GET", handler: handleUnsupported });
http.route({ path: "/mcp", method: "DELETE", handler: handleUnsupported });

export default http;
