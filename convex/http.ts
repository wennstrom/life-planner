import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

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

export default http;
