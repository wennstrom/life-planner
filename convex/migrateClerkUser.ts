import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { TableNames } from "./_generated/dataModel";

/**
 * One-off backfill that repoints a user's data from the Convex Auth user id to
 * the Clerk subject. Internal only — never expose this as a public mutation.
 *
 * Deploy / schema-push order (do this before or with the narrowed schema):
 * 1. Delete legacy `googleAccounts` rows in the dashboard if they still carry
 *    `accessToken` / `refreshToken` / `tokenExpiry` — Convex will reject those
 *    documents against the current schema. Sync metadata is rebuilt on reconnect.
 * 2. Push the Clerk schema (no `users` table; string `userId`; slim googleAccounts).
 * 3. Run this migration from the CLI or dashboard:
 *
 *   npx convex run internal.migrateClerkUser.run \
 *     '{"legacyUserId":"...","clerkUserId":"user_..."}'
 *
 * 4. Confirm tasks load under the Clerk session, reconnect Google Calendar, then
 *    delete this module (+ test) so the remapper is not left in the deployment.
 */

/** Tables whose only user link is `userId`, so a patch is enough. */
const REMAPPED_TABLES = [
  "projects",
  "tasks",
  "timeBlocks",
  "dayRecords",
] as const satisfies ReadonlyArray<TableNames>;

/** Fields the Convex Auth era stored on googleAccounts; the schema now rejects them. */
type LegacyGoogleAccount = {
  userId: string;
  calendarSyncToken?: string;
  watchChannelId?: string;
  watchResourceId?: string;
  watchExpiry?: number;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
};

type MigratedGoogleAccount = {
  userId: string;
  calendarSyncToken?: string;
  watchChannelId?: string;
  watchResourceId?: string;
  watchExpiry?: number;
};

/**
 * Rebuilds a googleAccounts row with only the fields the current schema allows,
 * dropping any OAuth secrets a legacy row still carries. Tokens now live in
 * Clerk, so there is nothing to preserve.
 */
export function toMigratedGoogleAccount(
  row: LegacyGoogleAccount,
  clerkUserId: string,
): MigratedGoogleAccount {
  const migrated: MigratedGoogleAccount = { userId: clerkUserId };
  if (row.calendarSyncToken !== undefined) {
    migrated.calendarSyncToken = row.calendarSyncToken;
  }
  if (row.watchChannelId !== undefined) {
    migrated.watchChannelId = row.watchChannelId;
  }
  if (row.watchResourceId !== undefined) {
    migrated.watchResourceId = row.watchResourceId;
  }
  if (row.watchExpiry !== undefined) {
    migrated.watchExpiry = row.watchExpiry;
  }
  return migrated;
}

export const run = internalMutation({
  args: {
    legacyUserId: v.string(),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.legacyUserId.length === 0 || args.clerkUserId.length === 0) {
      throw new Error("legacyUserId and clerkUserId must be non-empty");
    }
    if (args.legacyUserId === args.clerkUserId) {
      throw new Error("legacyUserId and clerkUserId must differ");
    }

    for (const table of REMAPPED_TABLES) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        if (row.userId === args.legacyUserId) {
          await ctx.db.patch(table, row._id, { userId: args.clerkUserId });
        }
      }
    }

    const googleAccounts = await ctx.db.query("googleAccounts").collect();
    for (const row of googleAccounts) {
      if (row.userId !== args.legacyUserId) {
        continue;
      }
      await ctx.db.replace(
        "googleAccounts",
        row._id,
        toMigratedGoogleAccount(row, args.clerkUserId),
      );
    }
  },
});
