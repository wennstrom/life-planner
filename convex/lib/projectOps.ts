import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const listProjectsArgs = v.object({
  status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
});

/** The user's projects with one status (active by default), in board order. */
export async function listProjectsForUser(
  ctx: QueryCtx,
  userId: string,
  args: Infer<typeof listProjectsArgs>,
): Promise<Array<Doc<"projects">>> {
  const status = args.status ?? "active";

  const projects = await ctx.db
    .query("projects")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", status),
    )
    .collect();

  return projects.sort((a, b) => a.order - b.order);
}
