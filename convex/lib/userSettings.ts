import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

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

type SettingsPatch = Partial<
  Pick<Doc<"userSettings">, "timezone" | "agentsCanMarkDone">
>;

/** Writes `patch` to the user's settings row, creating it if needed. */
export async function patchUserSettings(
  ctx: MutationCtx,
  userId: string,
  patch: SettingsPatch,
): Promise<void> {
  const existing = await getUserSettings(ctx, userId);
  if (existing === null) {
    await ctx.db.insert("userSettings", {
      userId,
      ...patch,
      updatedAt: Date.now(),
    });
    return;
  }
  await ctx.db.patch("userSettings", existing._id, {
    ...patch,
    updatedAt: Date.now(),
  });
}

/** Whether MCP agents may move tasks to the done column. Default false. */
export function agentsCanMarkDone(
  settings: Doc<"userSettings"> | null,
): boolean {
  return settings?.agentsCanMarkDone === true;
}
