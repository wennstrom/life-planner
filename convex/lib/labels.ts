import { v } from "convex/values";
import { internal } from "../_generated/api";
import { BOARD_COLUMN_COLORS } from "./boardColumnColors";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Label (epic) business rules shared by the public functions (Clerk auth) and
// the MCP tools (token auth). Callers resolve `userId` themselves.

export const MAX_LABELS_PER_USER = 50;
export const MAX_LABELS_PER_TASK = 10;
export const MAX_LABEL_NAME_LENGTH = 40;
/** Tasks scanned per transaction when stripping a deleted label. */
export const LABEL_STRIP_BATCH = 200;

/** Labels use the board column palette. */
export const LABEL_COLORS = BOARD_COLUMN_COLORS;

type Ctx = QueryCtx | MutationCtx;

export const createLabelArgs = v.object({
  name: v.string(),
  color: v.optional(v.string()),
});

export const updateLabelArgs = v.object({
  labelId: v.id("labels"),
  name: v.optional(v.string()),
  color: v.optional(v.string()),
});

export type CreateLabelArgs = Infer<typeof createLabelArgs>;
export type UpdateLabelArgs = Infer<typeof updateLabelArgs>;

/** Trims and collapses inner whitespace: "  Agent   MCP " → "Agent MCP". */
export function normalizeLabelName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** The uniqueness key: names differing only in case or spacing clash. */
export function labelNameKey(name: string): string {
  return normalizeLabelName(name).toLowerCase();
}

function assertValidName(name: string): string {
  const normalized = normalizeLabelName(name);
  if (!normalized) throw new Error("Label name is required");
  if (normalized.length > MAX_LABEL_NAME_LENGTH) {
    throw new Error(
      `Label names can be at most ${MAX_LABEL_NAME_LENGTH} characters`,
    );
  }
  return normalized;
}

function assertValidLabelColor(color: string) {
  if (!(LABEL_COLORS as ReadonlyArray<string>).includes(color)) {
    throw new Error(`Invalid label color. Use one of ${LABEL_COLORS.join(", ")}`);
  }
}

/** The user's labels in display order. Bounded by MAX_LABELS_PER_USER. */
export async function listLabelsForUser(
  ctx: Ctx,
  userId: string,
): Promise<Array<Doc<"labels">>> {
  // +1 so a user somehow over the cap still gets a consistent list.
  const rows = await ctx.db
    .query("labels")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_LABELS_PER_USER + 1);
  return rows.sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
}

export async function getOwnedLabelForUser(
  ctx: Ctx,
  userId: string,
  labelId: Id<"labels">,
): Promise<Doc<"labels">> {
  const label = await ctx.db.get("labels", labelId);
  if (!label || label.userId !== userId) {
    throw new Error("Label not found");
  }
  return label;
}

function assertNameFree(
  existing: Array<Doc<"labels">>,
  name: string,
  exceptId?: Id<"labels">,
) {
  const key = labelNameKey(name);
  const clash = existing.find(
    (label) => label._id !== exceptId && labelNameKey(label.name) === key,
  );
  if (clash) throw new Error(`A label named "${clash.name}" already exists`);
}

export async function createLabelForUser(
  ctx: MutationCtx,
  userId: string,
  args: CreateLabelArgs,
): Promise<Id<"labels">> {
  const name = assertValidName(args.name);
  const existing = await listLabelsForUser(ctx, userId);
  if (existing.length >= MAX_LABELS_PER_USER) {
    throw new Error(
      `You can have at most ${MAX_LABELS_PER_USER} labels. Delete one first`,
    );
  }
  assertNameFree(existing, name);
  const color = args.color ?? LABEL_COLORS[existing.length % LABEL_COLORS.length];
  assertValidLabelColor(color);
  const order =
    existing.length > 0 ? existing[existing.length - 1].order + 1 : 0;
  return await ctx.db.insert("labels", { userId, name, color, order });
}

export async function updateLabelForUser(
  ctx: MutationCtx,
  userId: string,
  args: UpdateLabelArgs,
): Promise<void> {
  await getOwnedLabelForUser(ctx, userId, args.labelId);
  const patch: Partial<Pick<Doc<"labels">, "name" | "color">> = {};
  if (args.name !== undefined) {
    const name = assertValidName(args.name);
    assertNameFree(await listLabelsForUser(ctx, userId), name, args.labelId);
    patch.name = name;
  }
  if (args.color !== undefined) {
    assertValidLabelColor(args.color);
    patch.color = args.color;
  }
  await ctx.db.patch("labels", args.labelId, patch);
}

/**
 * Checks a task's new label list: deduplicated, at most MAX_LABELS_PER_TASK,
 * every label owned by `userId`. Returns the list to store (undefined = none).
 */
export async function resolveTaskLabelIds(
  ctx: Ctx,
  userId: string,
  labelIds: Array<Id<"labels">>,
): Promise<Array<Id<"labels">> | undefined> {
  const unique = [...new Set(labelIds)];
  if (unique.length > MAX_LABELS_PER_TASK) {
    throw new Error(`A task can have at most ${MAX_LABELS_PER_TASK} labels`);
  }
  for (const labelId of unique) {
    await getOwnedLabelForUser(ctx, userId, labelId);
  }
  return unique.length > 0 ? unique : undefined;
}

/** The task's labels that still exist, in the task's order. */
export async function labelsForTask(
  ctx: Ctx,
  task: Doc<"tasks">,
): Promise<Array<Doc<"labels">>> {
  const labels: Array<Doc<"labels">> = [];
  for (const labelId of task.labelIds ?? []) {
    const label = await ctx.db.get("labels", labelId);
    if (label && label.userId === task.userId) labels.push(label);
  }
  return labels;
}

export function taskHasLabel(
  task: Pick<Doc<"tasks">, "labelIds">,
  labelId: Id<"labels">,
): boolean {
  return task.labelIds?.includes(labelId) ?? false;
}

/**
 * Removes `labelId` from one page of the user's tasks. Returns the cursor to
 * continue from, or null when every task has been checked.
 */
export async function stripLabelFromTaskPage(
  ctx: MutationCtx,
  userId: string,
  labelId: Id<"labels">,
  cursor: string | null,
): Promise<string | null> {
  const page = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .paginate({ numItems: LABEL_STRIP_BATCH, cursor });
  for (const task of page.page) {
    if (!taskHasLabel(task, labelId)) continue;
    const rest = (task.labelIds ?? []).filter((id) => id !== labelId);
    await ctx.db.patch("tasks", task._id, {
      labelIds: rest.length > 0 ? rest : undefined,
    });
  }
  return page.isDone ? null : page.continueCursor;
}

/**
 * Deletes a label and removes it from the user's tasks. The first batch of
 * tasks is cleaned in this transaction; the rest continue in
 * `internal.labels.stripFromTasks`, one batch per transaction.
 */
export async function deleteLabelForUser(
  ctx: MutationCtx,
  userId: string,
  labelId: Id<"labels">,
): Promise<void> {
  await getOwnedLabelForUser(ctx, userId, labelId);
  await ctx.db.delete("labels", labelId);
  const cursor = await stripLabelFromTaskPage(ctx, userId, labelId, null);
  if (cursor !== null) {
    await ctx.scheduler.runAfter(0, internal.labels.stripFromTasks, {
      userId,
      labelId,
      cursor,
    });
  }
}

// --- "[Foo] title" → label Foo + title "title" ------------------------------

const TITLE_PREFIX = /^\s*\[([^\]]+)\]\s*(.*)$/;

/** Splits "[Foo] Do it" into { label: "Foo", title: "Do it" }, else null. */
export function parseTitlePrefix(
  title: string,
): { label: string; title: string } | null {
  const match = TITLE_PREFIX.exec(title);
  if (!match) return null;
  const label = normalizeLabelName(match[1]);
  const rest = match[2].trim();
  if (!label || !rest || label.length > MAX_LABEL_NAME_LENGTH) return null;
  return { label, title: rest };
}
