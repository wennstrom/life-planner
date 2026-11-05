import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  MAX_LABELS_PER_TASK,
  createLabelArgs,
  createLabelForUser,
  deleteLabelForUser,
  labelNameKey,
  listLabelsForUser,
  parseTitlePrefix,
  stripLabelFromTaskPage,
  updateLabelArgs,
  updateLabelForUser,
} from "./lib/labels";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await listLabelsForUser(ctx, userId);
  },
});

export const create = mutation({
  args: createLabelArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await createLabelForUser(ctx, userId, args);
  },
});

export const update = mutation({
  args: updateLabelArgs.fields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await updateLabelForUser(ctx, userId, args);
  },
});

/**
 * Deletes a label and removes it from the user's tasks. The first batch of
 * tasks is cleaned in this transaction; the rest continue in `stripFromTasks`.
 */
export const remove = mutation({
  args: { labelId: v.id("labels") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await deleteLabelForUser(ctx, userId, args.labelId);
  },
});

export const stripFromTasks = internalMutation({
  args: { userId: v.string(), labelId: v.id("labels"), cursor: v.string() },
  handler: async (ctx, args) => {
    const cursor = await stripLabelFromTaskPage(
      ctx,
      args.userId,
      args.labelId,
      args.cursor,
    );
    if (cursor !== null) {
      await ctx.scheduler.runAfter(0, internal.labels.stripFromTasks, {
        ...args,
        cursor,
      });
    }
  },
});

const PREFIX_BATCH = 100;

/**
 * One-off, run by hand from the dashboard: turns task titles like
 * "[Agent MCP] Review column" into the label "Agent MCP" plus the title
 * "Review column". Creates missing labels. Tasks are processed in batches;
 * later batches are scheduled. Tasks are skipped (title kept) when the label
 * can't be created (50-label cap) or the task already has 10 other labels.
 */
export const fromTitlePrefixes = internalMutation({
  args: { userId: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const labels = await listLabelsForUser(ctx, args.userId);
    const byKey = new Map(labels.map((label) => [labelNameKey(label.name), label._id]));

    const page = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .paginate({ numItems: PREFIX_BATCH, cursor: args.cursor ?? null });

    let renamed = 0;
    let labelsCreated = 0;
    const skipped: Array<string> = [];
    for (const task of page.page) {
      const parsed = parseTitlePrefix(task.title);
      if (!parsed) continue;
      const key = labelNameKey(parsed.label);
      let labelId = byKey.get(key);
      if (labelId === undefined) {
        try {
          labelId = await createLabelForUser(ctx, args.userId, {
            name: parsed.label,
          });
        } catch (error) {
          skipped.push(`${task.title}: ${(error as Error).message}`);
          continue;
        }
        byKey.set(key, labelId);
        labelsCreated++;
      }
      const current = task.labelIds ?? [];
      const next = current.includes(labelId) ? current : [...current, labelId];
      if (next.length > MAX_LABELS_PER_TASK) {
        skipped.push(`${task.title}: already has ${MAX_LABELS_PER_TASK} labels`);
        continue;
      }
      await ctx.db.patch("tasks", task._id, {
        title: parsed.title,
        labelIds: next,
      });
      renamed++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.labels.fromTitlePrefixes, {
        userId: args.userId,
        cursor: page.continueCursor,
      });
    }
    return { renamed, labelsCreated, skipped, more: !page.isDone };
  },
});
