# Clerk Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Convex Auth with Clerk (prebuilt sign-in/up, password + Google), key all Convex data by Clerk user id strings (no `users` table), and make Google Calendar sync optional via Clerk-owned OAuth tokens.

**Architecture:** Clerk issues JWTs; Convex validates them via `auth.config.ts`. Ownership is `identity.subject` (`user_…`). Calendar connect uses Clerk `ExternalAccount.reauthorize` with calendar scopes; sync actions fetch access tokens from Clerk’s Backend API. `googleAccounts` keeps only sync/watch metadata.

**Tech Stack:** Clerk (`@clerk/react`), `convex/react-clerk` (`ConvexProviderWithClerk`), Convex, TanStack Router/Start, existing Google Calendar client, Vitest + `convex-test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-clerk-auth-design.md`
- No Convex `users` table; no storing Google `accessToken` / `refreshToken` / `tokenExpiry` in Convex
- Global Clerk Google SSO stays identity-only (no calendar scopes on the provider defaults)
- Calendar scope for connect: `https://www.googleapis.com/auth/calendar`
- Auth UI: Clerk prebuilt `<SignIn />` / `<SignUp />` only
- Use `useConvexAuth()` from `convex/react` for route gates (not Clerk’s `useAuth` alone)
- Single-user data migration: remap legacy Convex Auth user id → Clerk id, then delete temp artifacts
- After Google SSO login, Clerk may drop extra scopes — if a `googleAccounts` row exists, re-request calendar scopes via `reauthorize`
- Commit only when the user asked to commit; if they have not, skip every Commit step
- Work in a fresh git worktree from the base branch (see `AGENTS.md` / `using-git-worktrees`) before coding
- Before Convex deploy-affecting commands, follow `convex-deploy-guard` (classify deployment; explicit consent for prod)

## File structure

| File | Responsibility |
|---|---|
| `convex/auth.config.ts` | Clerk JWT issuer validation |
| `convex/schema.ts` | Drop `authTables`; `userId: v.string()`; slim `googleAccounts` |
| `convex/lib/auth.ts` | `requireUserId` / `getOptionalUserId` → Clerk `subject` string |
| `convex/users.ts` | `viewer` → `{ googleConnected }` only (no user doc) |
| `convex/google/clerkTokens.ts` | Fetch Google access token from Clerk Backend API |
| `convex/google/tokens.ts` | `getValidAccessToken` using Clerk + scope check |
| `convex/google/accounts.ts` | Metadata CRUD; drop `updateTokens` |
| `convex/google/connection.ts` | `markConnected` / `disconnect` mutations |
| `convex/migrateClerkUser.ts` | One-shot legacy id → Clerk id rewrite |
| `src/components/auth/ClerkConvexWrap.tsx` | `ClerkProvider` + `ConvexProviderWithClerk` |
| `src/routes/sign-in.tsx` | Clerk `<SignIn />` |
| `src/routes/sign-up.tsx` | Clerk `<SignUp />` (optional route if SignIn links need it) |
| `src/components/auth/AuthGate.tsx` | Gate on `useConvexAuth` from `convex/react` |
| `src/components/auth/ConnectGoogleCalendar.tsx` | Link/reauthorize Google + call `markConnected` |
| `src/components/layout/AppShell.tsx` | Clerk profile, sign-out, connect control |
| Delete | `convex/auth.ts`, `convex/lib/googleTokens.ts` (OAuth user upsert), `ConvexAuthWrap.tsx` |

---

### Task 1: Clerk app setup, packages, and Convex JWT config

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `convex/auth.config.ts`
- Modify: `.env.local` (local secrets; do not commit secrets)
- Modify: Convex dashboard env (human)

**Interfaces:**
- Consumes: nothing
- Produces: `CLERK_JWT_ISSUER_DOMAIN` on Convex; `VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` available; `@clerk/react` installed

- [ ] **Step 1: Human — create/configure Clerk**

1. Create a Clerk application at https://dashboard.clerk.com/apps/new
2. Enable email/password and Google SSO
3. Under Google SSO, keep **identity scopes only** (openid/email/profile) — do **not** add calendar scopes globally
4. Activate Convex integration: https://dashboard.clerk.com/apps/setup/convex — copy Frontend API URL
5. Copy Publishable Key and Secret Key from API keys
6. In Clerk, add allowed redirect URLs for the Vite app origin (e.g. `http://localhost:3000` or whatever port `vite` uses) and `/sign-in`, `/sign-up`, SSO callback paths Clerk documents for the prebuilt components

- [ ] **Step 2: Install packages**

Run:

```bash
npm install @clerk/react
```

Do **not** remove `@convex-dev/auth` yet (later task).

- [ ] **Step 3: Set environment variables**

In `.env.local` (frontend):

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

In Convex dashboard / `npx convex env set` (backend):

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://YOUR-INSTANCE.clerk.accounts.dev"
npx convex env set CLERK_SECRET_KEY "sk_test_..."
```

(Use the exact Frontend API URL from the Convex integration page for `CLERK_JWT_ISSUER_DOMAIN`.)

- [ ] **Step 4: Replace `convex/auth.config.ts`**

```ts
import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
```

- [ ] **Step 5: Sync Convex config**

Run: `npx convex dev` (or ensure existing `convex dev` picks up `auth.config.ts`)

Expected: deploy succeeds; no auth provider mismatch once a Clerk session exists (full verify in Task 7).

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add package.json package-lock.json convex/auth.config.ts
git commit -m "Configure Clerk JWT validation for Convex."
```

---

### Task 2: Schema cutover and string identity helpers

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/lib/auth.ts`
- Create: `convex/lib/auth.test.ts`
- Modify: `convex/users.ts`

**Interfaces:**
- Consumes: Clerk JWT `identity.subject`
- Produces:
  - `requireUserId(ctx): Promise<string>`
  - `getOptionalUserId(ctx): Promise<string | null>`
  - `api.users.viewer` → `{ googleConnected: boolean }`

- [ ] **Step 1: Write failing auth helper tests**

Create `convex/lib/auth.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { getOptionalUserId, requireUserId } from "./auth";

describe("requireUserId", () => {
  it("returns identity.subject for an authenticated caller", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user_test1" });

    const userId = await asUser.run(async (ctx) => requireUserId(ctx));
    expect(userId).toBe("user_test1");
  });

  it("throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => requireUserId(ctx)),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("getOptionalUserId", () => {
  it("returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => getOptionalUserId(ctx));
    expect(userId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test -- convex/lib/auth.test.ts`

Expected: FAIL (schema still has `users` / helpers still use `getAuthUserId`, or file missing).

- [ ] **Step 3: Update `convex/schema.ts`**

Remove `authTables` import and spread. Change every `userId: v.id("users")` to `userId: v.string()`. Slim `googleAccounts`:

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ... existing unions unchanged ...

export default defineSchema({
  googleAccounts: defineTable({
    userId: v.string(),
    calendarSyncToken: v.optional(v.string()),
    watchChannelId: v.optional(v.string()),
    watchResourceId: v.optional(v.string()),
    watchExpiry: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  projects: defineTable({
    userId: v.string(),
    // ...rest unchanged...
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  tasks: defineTable({
    userId: v.string(),
    // ...rest unchanged...
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_scheduledDate", ["userId", "scheduledDate"])
    .index("by_project", ["projectId"]),

  timeBlocks: defineTable({
    userId: v.string(),
    // ...rest unchanged...
  })
    .index("by_user", ["userId"])
    .index("by_user_start", ["userId", "start"])
    .index("by_googleEventId", ["googleEventId"])
    .index("by_syncState", ["syncState"])
    .index("by_task", ["taskId"]),

  notes: defineTable({
    userId: v.string(),
    // ...rest unchanged...
  })
    .index("by_user", ["userId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"]),

  dayRecords: defineTable({
    userId: v.string(),
    // ...rest unchanged...
  }).index("by_user_dateKey", ["userId", "dateKey"]),
});
```

(Keep existing field shapes for each table; only change `userId` type and remove auth tables / token fields.)

- [ ] **Step 4: Rewrite `convex/lib/auth.ts`**

```ts
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type AuthCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function requireUserId(ctx: AuthCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

export async function getOptionalUserId(
  ctx: AuthCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}
```

- [ ] **Step 5: Rewrite `convex/users.ts` viewer**

```ts
import { query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const googleAccount = await ctx.db
      .query("googleAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return {
      googleConnected: googleAccount !== null,
    };
  },
});
```

- [ ] **Step 6: Run auth tests**

Run: `npm test -- convex/lib/auth.test.ts`

Expected: PASS

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add convex/schema.ts convex/lib/auth.ts convex/lib/auth.test.ts convex/users.ts
git commit -m "Key Convex ownership by Clerk subject; drop auth users table."
```

---

### Task 3: Update Convex modules and tests for string `userId`

**Files:**
- Modify: `convex/google/accounts.ts`
- Modify: `convex/google/inbound.ts`
- Modify: `convex/google/inboundMutations.ts`
- Modify: `convex/google/tokens.ts` (args type only this task if body still old — prefer stubbing args to `v.string()`)
- Modify: `convex/today.ts`
- Modify: `convex/lib/taskStats.ts`
- Delete: `convex/lib/googleTokens.ts` (Convex Auth OAuth user upsert — unused after cutover)
- Modify: `convex/auth.ts` temporarily leave until Task 9, **or** stub so `http.ts` still compiles — prefer deleting auth HTTP in Task 9; for this task keep compile green
- Modify tests:
  - `convex/tasks.test.ts`
  - `convex/projects.test.ts`
  - `convex/timeBlocks.test.ts`
  - `convex/today.test.ts`
  - `convex/sync.test.ts`
  - `convex/lib/taskStats.test.ts`
  - `convex/migrations.test.ts`

**Interfaces:**
- Consumes: `requireUserId(): Promise<string>`
- Produces: all domain `userId` args/fields as `string`; shared test helper pattern below

- [ ] **Step 1: Replace test helper pattern in each `*.test.ts`**

Replace:

```ts
async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "test@example.com", name: "Test User" }),
  );
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}
```

With:

```ts
async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}
```

For “other user” cases, use `const otherUserId = "user_other"` — **do not** insert into `users`.

In `sync.test.ts`, insert `googleAccounts` **without** token fields:

```ts
await ctx.db.insert("googleAccounts", {
  userId,
  calendarSyncToken: "sync-token",
});
```

Remove assertions that patch/read `accessToken` / `refreshToken` unless rewritten in Task 5.

- [ ] **Step 2: Change validators `v.id("users")` → `v.string()`**

In `convex/google/accounts.ts`, `inbound.ts`, `inboundMutations.ts`, `tokens.ts`, and any other `v.id("users")` sites:

```ts
args: { userId: v.string() },
```

In `convex/today.ts` and `convex/lib/taskStats.ts`, change `Id<"users">` parameter types to `string`.

- [ ] **Step 3: Remove `updateTokens` from `convex/google/accounts.ts`**

Delete the `updateTokens` internalMutation (Clerk owns tokens). Keep `getByUser`, `updateSyncToken`, `updateWatchChannel`, `listAll`.

- [ ] **Step 4: Delete `convex/lib/googleTokens.ts`**

Remove the file. Fix any imports (only `convex/auth.ts` used it — leave `auth.ts` broken until Task 9 **or** delete `auth.addHttpRoutes` usage now if compile requires it).

If `convex/auth.ts` still imports it, temporarily change `convex/http.ts` to stop calling `auth.addHttpRoutes(http)` and delete `convex/auth.ts` early:

```ts
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
```

- [ ] **Step 5: Run full unit tests**

Run: `npm test`

Expected: PASS for domain tests; token/sync tests that still assume refresh tokens may FAIL — fix those fixtures to metadata-only and skip token-refresh assertions until Task 5, or mark them updated in Task 5 immediately after.

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add convex src package.json package-lock.json
git commit -m "Migrate Convex ownership fields to Clerk string user ids."
```

---

### Task 4: Fetch Google access tokens from Clerk

**Files:**
- Create: `convex/google/clerkTokens.ts`
- Modify: `convex/google/tokens.ts`
- Modify: `convex/google/tokenDecision.ts` (simplify)
- Modify: `convex/google/tokenDecision.test.ts`
- Modify: `convex/sync.test.ts` as needed

**Interfaces:**
- Consumes: `CLERK_SECRET_KEY`; `userId: string` (Clerk id)
- Produces:
  - `fetchClerkGoogleAccessToken(clerkUserId: string): Promise<{ token: string; scopes: string[] } | null>`
  - `internal.google.tokens.getValidAccessToken({ userId }) → string | null`

- [ ] **Step 1: Simplify scope decision helpers**

Replace refresh-oriented `nextGoogleTokenAction` with a pure helper used after Clerk returns a token:

In `convex/google/tokenDecision.ts`:

```ts
export type GoogleScopeStatus = "has_calendar" | "missing_calendar" | "unknown";

export function tokenInfoIndicatesCalendar(result: {
  ok: boolean;
  scope?: string;
}): GoogleScopeStatus {
  if (!result.ok) {
    return "unknown";
  }
  const scopes = result.scope?.split(/[ ,]+/).filter(Boolean) ?? [];
  return scopes.some((scope) => scope.includes("calendar"))
    ? "has_calendar"
    : "missing_calendar";
}

/** Prefer Clerk-reported scopes; fall back to tokeninfo status. */
export function clerkTokenUsable(input: {
  clerkScopes: string[];
  tokenInfoStatus: GoogleScopeStatus;
}): "use" | "fail_missing_scope" {
  const clerkHasCalendar = input.clerkScopes.some((s) =>
    s.includes("calendar"),
  );
  if (clerkHasCalendar) {
    return "use";
  }
  if (input.tokenInfoStatus === "has_calendar") {
    return "use";
  }
  if (
    input.tokenInfoStatus === "missing_calendar" ||
    input.clerkScopes.length > 0
  ) {
    return "fail_missing_scope";
  }
  // unknown tokeninfo and empty clerk scopes → fail closed for calendar sync
  return "fail_missing_scope";
}
```

Update `tokenDecision.test.ts` accordingly (remove refresh-path cases; add `clerkTokenUsable` cases).

- [ ] **Step 2: Implement Clerk token fetch**

Create `convex/google/clerkTokens.ts` (Node-safe fetch; used from `"use node"` action):

```ts
export type ClerkGoogleToken = {
  token: string;
  scopes: string[];
};

export async function fetchClerkGoogleAccessToken(
  clerkUserId: string,
): Promise<ClerkGoogleToken | null> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    console.error("CLERK_SECRET_KEY is not set");
    return null;
  }

  const url = `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}/oauth_access_tokens/oauth_google`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.error(
        `Clerk oauth_access_tokens failed: http=${res.status} user=${clerkUserId}`,
      );
      return null;
    }
    const data = (await res.json()) as Array<{
      token?: string;
      scopes?: string[];
    }>;
    const first = data[0];
    if (!first?.token) {
      return null;
    }
    return {
      token: first.token,
      scopes: first.scopes ?? [],
    };
  } catch (error) {
    console.error("Clerk oauth_access_tokens request failed", error);
    return null;
  }
}
```

- [ ] **Step 3: Rewrite `getValidAccessToken`**

In `convex/google/tokens.ts`:

```ts
"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { fetchClerkGoogleAccessToken } from "./clerkTokens";
import { isGoogleCalendarClientMocked } from "./client";
import {
  clerkTokenUsable,
  tokenInfoIndicatesCalendar,
  type GoogleScopeStatus,
} from "./tokenDecision";

const CALENDAR_SCOPE_HINT = "https://www.googleapis.com/auth/calendar";

async function fetchScopeStatus(accessToken: string): Promise<GoogleScopeStatus> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken }),
    });
    const data = (await res.json()) as { scope?: string };
    return tokenInfoIndicatesCalendar({ ok: res.ok, scope: data.scope });
  } catch {
    return "unknown";
  }
}

export const getValidAccessToken = internalAction({
  args: { userId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    // Still require a googleAccounts metadata row (set on Connect)
    const account = await ctx.runQuery(internal.google.accounts.getByUser, {
      userId: args.userId,
    });
    if (!account) {
      return null;
    }

    if (isGoogleCalendarClientMocked()) {
      return "mock-access-token";
    }

    const clerkToken = await fetchClerkGoogleAccessToken(args.userId);
    if (!clerkToken) {
      return null;
    }

    const tokenInfoStatus = await fetchScopeStatus(clerkToken.token);
    const decision = clerkTokenUsable({
      clerkScopes: clerkToken.scopes,
      tokenInfoStatus,
    });

    if (decision === "fail_missing_scope") {
      console.error(
        `Google access token for user ${args.userId} is missing calendar scope (${CALENDAR_SCOPE_HINT}). Reconnect Google Calendar in the app.`,
      );
      return null;
    }

    return clerkToken.token;
  },
});
```

- [ ] **Step 4: Update sync tests that asserted refresh-token patches**

Remove expectations around `accessToken` / `refreshToken` updates. Keep tests that assert sync/watch metadata updates.

- [ ] **Step 5: Run tests**

Run: `npm test -- convex/google/tokenDecision.test.ts convex/sync.test.ts`

Expected: PASS

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add convex/google
git commit -m "Load Google Calendar tokens from Clerk instead of stored refresh tokens."
```

---

### Task 5: Connect / disconnect calendar mutations

**Files:**
- Create: `convex/google/connection.ts`
- Create: `convex/google/connection.test.ts`
- Modify: `convex/google/accounts.ts` (add `ensureForUser` / `removeForUser` if needed)

**Interfaces:**
- Consumes: `requireUserId(): Promise<string>`; `internal.google.inbound.syncUser`
- Produces:
  - `api.google.connection.markConnected` → `null` (creates metadata row + schedules inbound sync)
  - `api.google.connection.disconnect` → `null` (deletes metadata; best-effort stop watch)

- [ ] **Step 1: Write failing connection tests**

```ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { modules } from "../test.setup";

describe("google.connection", () => {
  it("markConnected inserts googleAccounts for the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.google.connection.markConnected, {});

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("googleAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(row?.userId).toBe(userId);
  });

  it("disconnect removes googleAccounts", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.google.connection.markConnected, {});
    await asUser.mutation(api.google.connection.disconnect, {});

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("googleAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(row).toBeNull();
  });

  it("viewer.googleConnected reflects metadata row", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_test1";
    const asUser = t.withIdentity({ subject: userId });

    let viewer = await asUser.query(api.users.viewer, {});
    expect(viewer.googleConnected).toBe(false);

    await asUser.mutation(api.google.connection.markConnected, {});
    viewer = await asUser.query(api.users.viewer, {});
    expect(viewer.googleConnected).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- convex/google/connection.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `convex/google/connection.ts`**

```ts
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { requireUserId } from "../lib/auth";

export const markConnected = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("googleAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!existing) {
      await ctx.db.insert("googleAccounts", { userId });
    }

    await ctx.scheduler.runAfter(0, internal.google.inbound.syncUser, {
      userId,
    });
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("googleAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!existing) {
      return;
    }
    // Best-effort: schedule watch stop if you already have an internal helper;
    // otherwise delete metadata and let watch expiry / push no-ops handle it.
    await ctx.db.delete(existing._id);
  },
});
```

If `internal.google.watch` has a stop/unsubscribe action, call it before delete; otherwise document soft cleanup.

- [ ] **Step 4: Run tests**

Run: `npm test -- convex/google/connection.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add convex/google/connection.ts convex/google/connection.test.ts
git commit -m "Add Google Calendar connect and disconnect mutations."
```

---

### Task 6: Frontend Clerk providers, AuthGate, and sign-in/up

**Files:**
- Create: `src/components/auth/ClerkConvexWrap.tsx`
- Delete: `src/components/auth/ConvexAuthWrap.tsx`
- Modify: `src/router.tsx`
- Modify: `src/components/auth/AuthGate.tsx`
- Modify: `src/routes/sign-in.tsx`
- Create: `src/routes/sign-up.tsx`

**Interfaces:**
- Consumes: `VITE_CLERK_PUBLISHABLE_KEY`; `ConvexProviderWithClerk` + Clerk `useAuth`
- Produces: authenticated Convex client for the router tree

- [ ] **Step 1: Create `ClerkConvexWrap`**

```tsx
import { ClerkProvider, useAuth } from '@clerk/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import type { ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'

export function ClerkConvexWrap({
  client,
  children,
}: {
  client: ConvexReactClient
  children: ReactNode
}) {
  const publishableKey = (import.meta as any).env
    .VITE_CLERK_PUBLISHABLE_KEY as string | undefined
  if (!publishableKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
```

- [ ] **Step 2: Point `src/router.tsx` at `ClerkConvexWrap`**

Replace `ConvexAuthWrap` import/usage with `ClerkConvexWrap`.

- [ ] **Step 3: Update `AuthGate`**

```tsx
import { useConvexAuth } from 'convex/react'
import { Navigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const [authTimedOut, setAuthTimedOut] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setAuthTimedOut(true), 10_000)
    return () => window.clearTimeout(timeout)
  }, [])

  if (isLoading && !authTimedOut) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        Signing you in…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
```

- [ ] **Step 4: Replace sign-in page**

```tsx
import { SignIn } from '@clerk/react'
import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  const { isLoading, isAuthenticated } = useConvexAuth()

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Checking session…
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/today" replace />
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/today"
      />
    </div>
  )
}
```

- [ ] **Step 5: Add `src/routes/sign-up.tsx`**

```tsx
import { SignUp } from '@clerk/react'
import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
})

function SignUpPage() {
  const { isLoading, isAuthenticated } = useConvexAuth()

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Checking session…
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/today" replace />
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/today"
      />
    </div>
  )
}
```

Let the TanStack router plugin regenerate `routeTree.gen.ts` on dev/build.

- [ ] **Step 6: Manual smoke**

Run: `npm run dev`

Expected: `/sign-in` shows Clerk UI; after sign-in, `/today` loads and Convex queries authenticate (`useConvexAuth().isAuthenticated === true`).

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add src/components/auth src/router.tsx src/routes/sign-in.tsx src/routes/sign-up.tsx src/routeTree.gen.ts
git commit -m "Wire Clerk providers and prebuilt sign-in/up screens."
```

---

### Task 7: AppShell profile, sign-out, and Connect Google Calendar

**Files:**
- Create: `src/components/auth/ConnectGoogleCalendar.tsx`
- Create: `src/lib/googleCalendarScopes.ts`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `api.users.viewer`, `api.google.connection.markConnected` / `disconnect`, Clerk `useUser` / `useClerk`
- Produces: connect/disconnect UX; auto-reauthorize when metadata exists but scopes missing

- [ ] **Step 1: Scope constant helper**

```ts
// src/lib/googleCalendarScopes.ts
export const GOOGLE_CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar'

export function googleAccountHasCalendarScope(approvedScopes: string): boolean {
  return approvedScopes.split(' ').some((s) => s.includes('calendar'))
}
```

- [ ] **Step 2: Implement `ConnectGoogleCalendar`**

```tsx
import { useUser } from '@clerk/react'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import {
  GOOGLE_CALENDAR_SCOPE,
  googleAccountHasCalendarScope,
} from '~/lib/googleCalendarScopes'

export function ConnectGoogleCalendar({
  googleConnected,
}: {
  googleConnected: boolean
}) {
  const { user } = useUser()
  const markConnected = useMutation(api.google.connection.markConnected)
  const disconnect = useMutation(api.google.connection.disconnect)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function connect() {
    if (!user) return
    setError(null)
    setPending(true)
    try {
      let google = user.externalAccounts.find((a) => a.provider === 'google')

      if (!google) {
        const created = await user.createExternalAccount({
          strategy: 'oauth_google',
          redirectUrl: window.location.href,
          additionalScopes: [GOOGLE_CALENDAR_SCOPE],
        })
        // Follow Clerk redirect if verification URL present
        const redirect =
          created.verification?.externalVerificationRedirectURL
        if (redirect) {
          window.location.href = redirect.href
          return
        }
        google = created
      }

      if (!googleAccountHasCalendarScope(google.approvedScopes ?? '')) {
        const reauth = await google.reauthorize({
          redirectUrl: window.location.href,
          additionalScopes: [GOOGLE_CALENDAR_SCOPE],
        })
        const redirect = reauth.verification?.externalVerificationRedirectURL
        if (redirect) {
          window.location.href = redirect.href
          return
        }
      }

      await markConnected({})
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not connect Google Calendar',
      )
    } finally {
      setPending(false)
    }
  }

  async function onDisconnect() {
    setPending(true)
    setError(null)
    try {
      await disconnect({})
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not disconnect calendar',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 px-3">
      {googleConnected ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => void onDisconnect()}
        >
          Disconnect Google Calendar
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => void connect()}
        >
          {pending ? 'Connecting…' : 'Connect Google Calendar'}
        </Button>
      )}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
```

Adjust `createExternalAccount` / `reauthorize` field names to match the installed `@clerk/react` typings if they differ slightly.

- [ ] **Step 3: Restore scopes when metadata exists but Clerk dropped them**

In `AppShell` (or a small hook used by `ConnectGoogleCalendar`), when `viewer.googleConnected` is true, on mount check Google `approvedScopes`; if missing calendar, call `reauthorize` with `GOOGLE_CALENDAR_SCOPE` (same redirect pattern). This counters Clerk resetting scopes on identity Google sign-in.

- [ ] **Step 4: Update `AppShell`**

- Remove `@convex-dev/auth` imports
- `useConvexAuth` from `convex/react`
- `useClerk().signOut()` or `<SignOutButton />` for sign-out
- `useUser()` for name/email/initials (replace `viewer.user`)
- Render status dot from `viewer?.googleConnected`
- Render `<ConnectGoogleCalendar googleConnected={viewer?.googleConnected ?? false} />`

- [ ] **Step 5: Manual verify**

1. Sign in with email/password — app works, Google shows not connected  
2. Connect Google Calendar — consent — status becomes connected; calendar sync runs  
3. Sign out / sign in — if scopes dropped, auto-reauthorize should repair  
4. Disconnect — status clears; sync soft-fails

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add src/components/auth/ConnectGoogleCalendar.tsx src/lib/googleCalendarScopes.ts src/components/layout/AppShell.tsx
git commit -m "Add optional Google Calendar connect via Clerk reauthorize."
```

---

### Task 8: One-shot legacy user id migration

**Files:**
- Create: `convex/migrateClerkUser.ts`
- Create: `convex/migrateClerkUser.test.ts`

**Interfaces:**
- Consumes: `legacyUserId: string`, `clerkUserId: string` (run once as authenticated Clerk user **or** as internal with explicit args)
- Produces: all domain rows remapped; `googleAccounts` token-less; legacy mapping not retained

- [ ] **Step 1: Write migration test**

```ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

describe("migrateClerkUser", () => {
  it("rewrites domain rows from legacy id to Clerk id", async () => {
    const t = convexTest(schema, modules);
    const legacyUserId = "jh7legacy000000000000000000";
    const clerkUserId = "user_clerk123";

    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", {
        userId: legacyUserId,
        title: "Keep me",
        status: "backlog",
        order: 0,
      });
      await ctx.db.insert("googleAccounts", { userId: legacyUserId });
    });

    const asUser = t.withIdentity({ subject: clerkUserId });
    await asUser.mutation(api.migrateClerkUser.run, {
      legacyUserId,
      clerkUserId,
    });

    await t.run(async (ctx) => {
      const tasks = await ctx.db.query("tasks").collect();
      expect(tasks[0]?.userId).toBe(clerkUserId);
      const g = await ctx.db.query("googleAccounts").collect();
      expect(g[0]?.userId).toBe(clerkUserId);
    });
  });
});
```

- [ ] **Step 2: Implement mutation**

```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";

const TABLES = [
  "projects",
  "tasks",
  "timeBlocks",
  "notes",
  "dayRecords",
  "googleAccounts",
] as const;

export const run = mutation({
  args: {
    legacyUserId: v.string(),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireUserId(ctx);
    if (caller !== args.clerkUserId) {
      throw new Error("Unauthorized");
    }

    for (const table of TABLES) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        if (row.userId === args.legacyUserId) {
          await ctx.db.patch(row._id, { userId: args.clerkUserId });
        }
      }
    }
  },
});
```

(Typing: use a switch/cast per table if `query(table)` is not accepted — patch each table explicitly.)

- [ ] **Step 3: Run test**

Run: `npm test -- convex/migrateClerkUser.test.ts`

Expected: PASS

- [ ] **Step 4: Human runbook (single user)**

1. In Convex dashboard, note legacy `userId` on any task (old Convex Auth document id string) **before** or from remaining data
2. Sign in with Clerk using the **same email**
3. From browser console or a temporary UI, call `migrateClerkUser.run({ legacyUserId, clerkUserId: user.id })`
4. Confirm tasks load under the new session
5. **Delete** `api.migrateClerkUser` module (or the public mutation) after success — do not leave a public remapper in production
6. Re-connect Google Calendar (Task 7) — legacy Google tokens are gone

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add convex/migrateClerkUser.ts convex/migrateClerkUser.test.ts
git commit -m "Add one-shot migration from legacy Convex Auth user ids to Clerk."
```

---

### Task 9: Remove Convex Auth packages and dead code

**Files:**
- Delete: `convex/auth.ts` (if still present)
- Modify: `convex/http.ts` (no `auth.addHttpRoutes`)
- Modify: `package.json` — remove `@convex-dev/auth`, `@auth/core`
- Grep and remove any remaining `@convex-dev/auth` imports
- After migration success: delete `convex/migrateClerkUser.ts` (+ test) in a follow-up commit

**Interfaces:**
- Consumes: Tasks 1–8 complete
- Produces: clean dependency tree; app runs only on Clerk

- [ ] **Step 1: Grep for leftovers**

Run:

```bash
rg -n "@convex-dev/auth|@auth/core|getAuthUserId|ConvexAuth|authTables|createOrUpdateOAuthUser" .
```

Expected: only historical docs/spec/plan references (or none in `src/` / `convex/`).

- [ ] **Step 2: Uninstall packages**

```bash
npm uninstall @convex-dev/auth @auth/core
```

- [ ] **Step 3: Full verify**

```bash
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 4: Manual checklist**

- [ ] Email/password sign-up and sign-in  
- [ ] Google SSO sign-in (no calendar prompt)  
- [ ] App usable without calendar  
- [ ] Connect calendar → sync works  
- [ ] Disconnect calendar  
- [ ] Legacy data visible after migration  
- [ ] Migration helper removed after use  

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add -A
git commit -m "Remove Convex Auth; Clerk is the sole authentication provider."
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Clerk auth + prebuilt UI | 1, 6 |
| Password + Google (Clerk defaults) | 1 (dashboard), 6 |
| Optional calendar via Clerk reauthorize | 5, 7 |
| Clerk-owned tokens / no refresh in Convex | 2 (schema), 4 |
| No `users` table; `userId` string | 2, 3 |
| Migrate existing data to Clerk id | 8 |
| Delete temp migration after | 8 Step 4, 9 |
| `useConvexAuth` gate | 6 |
| Soft-fail sync without token | 4 |
| Tests with string subjects | 3, 4, 5 |
| Human Clerk dashboard setup | 1 |

## Placeholder / consistency notes

- Calendar scope string is consistently `https://www.googleapis.com/auth/calendar`
- `requireUserId` always returns `Promise<string>` (Clerk subject)
- `markConnected` / `disconnect` live under `api.google.connection.*`
- Frontend wrap component name: `ClerkConvexWrap`
