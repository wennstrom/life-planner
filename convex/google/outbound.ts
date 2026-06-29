"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getGoogleCalendarClient, toGoogleEventPayload } from "./client";

export const syncBlock = internalAction({
  args: { blockId: v.id("timeBlocks") },
  handler: async (ctx, args) => {
    const block = await ctx.runQuery(internal.google.outboundQueries.getBlockQuery, {
      blockId: args.blockId,
    });
    if (!block || block.origin !== "app") {
      return;
    }

    const accessToken = await ctx.runAction(
      internal.google.tokens.getValidAccessToken,
      { userId: block.userId },
    );
    if (!accessToken) {
      await ctx.runMutation(internal.timeBlocks.markSynced, {
        blockId: args.blockId,
        syncState: "error",
      });
      return;
    }

    try {
      const client = getGoogleCalendarClient(accessToken);
      const payload = toGoogleEventPayload(block);

      let googleEventId = block.googleEventId;
      if (googleEventId) {
        await client.updateEvent(googleEventId, payload);
      } else {
        const created = await client.insertEvent(payload);
        googleEventId = created.id;
      }

      await ctx.runMutation(internal.timeBlocks.markSynced, {
        blockId: args.blockId,
        googleEventId,
        syncState: "synced",
      });
    } catch (error) {
      console.error("Outbound sync failed", error);
      await ctx.runMutation(internal.timeBlocks.markSynced, {
        blockId: args.blockId,
        syncState: "error",
      });
      await ctx.scheduler.runAfter(5000, internal.google.outbound.syncBlock, {
        blockId: args.blockId,
      });
    }
  },
});

export const deleteBlock = internalAction({
  args: { blockId: v.id("timeBlocks") },
  handler: async (ctx, args) => {
    const block = await ctx.runQuery(internal.google.outboundQueries.getBlockQuery, {
      blockId: args.blockId,
    });
    if (!block) {
      return;
    }

    if (block.googleEventId) {
      const accessToken = await ctx.runAction(
        internal.google.tokens.getValidAccessToken,
        { userId: block.userId },
      );
      if (accessToken) {
        try {
          const client = getGoogleCalendarClient(accessToken);
          await client.deleteEvent(block.googleEventId);
        } catch (error) {
          console.error("Google delete failed", error);
        }
      }
    }

    await ctx.runMutation(internal.timeBlocks.deleteInternal, {
      blockId: args.blockId,
    });
  },
});
