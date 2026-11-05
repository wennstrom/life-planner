import { getDoneColumn } from "./boardColumns";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Rules for what MCP agents may do that the user may always do in the UI.
// Only MCP code calls these; the public mutations don't.

export const AGENTS_CANT_MARK_DONE_ERROR =
  "Agents can't mark tasks done. Move it to Review; the user moves Review → Done.";

/**
 * Throws unless an agent may put a task in `targetColumnId`. Moving into the
 * done column needs `userSettings.agentsCanMarkDone`; a task that is already
 * done may stay there. `null`/`undefined` (the backlog) is always allowed.
 */
export async function assertAgentMayPlaceInColumn(
  ctx: QueryCtx,
  userId: string,
  options: {
    agentsCanMarkDone: boolean;
    targetColumnId: Id<"boardColumns"> | null | undefined;
    currentColumnId?: Id<"boardColumns">;
  },
): Promise<void> {
  if (options.agentsCanMarkDone || !options.targetColumnId) return;
  const done = await getDoneColumn(ctx, userId);
  if (!done || options.targetColumnId !== done._id) return;
  if (options.currentColumnId === done._id) return;
  throw new Error(AGENTS_CANT_MARK_DONE_ERROR);
}
