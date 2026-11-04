import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function getUserSettings(
  ctx: QueryCtx,
  userId: string,
): Promise<Doc<"userSettings"> | null> {
  return await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/** True if the runtime knows `timezone` as an IANA zone name. */
export function isValidTimezone(timezone: string): boolean {
  if (timezone.trim() === "" || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
