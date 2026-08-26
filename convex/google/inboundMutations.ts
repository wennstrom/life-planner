import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { parseGoogleEventTimes } from "./client";

export const applyEvent = internalMutation({
  args: {
    userId: v.string(),
    event: v.any(),
  },
  handler: async (ctx, args) => {
    const event = args.event as {
      id: string;
      summary?: string;
      status?: string;
      updated?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
    };

    if (event.status === "cancelled") {
      const existing = await ctx.db
        .query("timeBlocks")
        .withIndex("by_googleEventId", (q) => q.eq("googleEventId", event.id))
        .unique();
      if (existing && existing.userId === args.userId) {
        await ctx.db.delete("timeBlocks", existing._id);
      }
      return;
    }

    const times = parseGoogleEventTimes(event);
    if (!times) {
      return;
    }

    const existing = await ctx.db
      .query("timeBlocks")
      .withIndex("by_googleEventId", (q) => q.eq("googleEventId", event.id))
      .unique();

    if (existing) {
      if (existing.origin === "app" && existing.updatedAt > times.updatedAt) {
        return;
      }

      const patch: Record<string, unknown> = {
        start: times.start,
        end: times.end,
        syncState: "synced",
        lastSyncedAt: Date.now(),
        updatedAt: times.updatedAt,
      };
      if (existing.origin !== "app") {
        patch.title = event.summary ?? existing.title;
      }
      await ctx.db.patch("timeBlocks", existing._id, patch);
      return;
    }

    await ctx.db.insert("timeBlocks", {
      userId: args.userId,
      title: event.summary ?? "Untitled",
      start: times.start,
      end: times.end,
      googleEventId: event.id,
      origin: "google",
      syncState: "synced",
      lastSyncedAt: Date.now(),
      updatedAt: times.updatedAt,
    });
  },
});
