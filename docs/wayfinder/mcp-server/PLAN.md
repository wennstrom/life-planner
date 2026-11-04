# MCP Server — Implementation Plan

**Status:** Planned (grilled 2026-11-04)

## Goal

Let any MCP-capable agent (Claude Code, Cursor, Codex, Agent SDK scripts) read and change
tasks and calendar blocks in Life Planner, acting as the signed-in user, with the same
validation and ownership rules as the UI.

## Decisions

| # | Decision |
|---|----------|
| 1 | Remote MCP server in Convex HTTP actions at `https://<deployment>.convex.site/mcp`. Stateless Streamable HTTP with plain JSON responses: no sessions, no SSE. |
| 2 | Auth: personal access tokens (PATs) sent as `Authorization: Bearer lp_…`. All auth goes through one function, `resolveUserFromRequest`, so Clerk OAuth can be added later for claude.ai and mobile. |
| 3 | Agents can archive and unarchive tasks but never delete them, because `deleteTaskRecord` also deletes orphaned blocks and their Google events. |
| 4 | Calendar: agents can read every block but only write `origin: "app"` blocks. Imported Google events are read-only, and changes reach Google through the existing outbound sync. |
| 5 | Tool set is listed below. Projects and columns are read-only. Out of scope: reorder, reviews, day intentions. |
| 6 | Timezone: the user's IANA zone is stored in `userSettings` and synced from the browser. Tools require ISO 8601 times with an offset and return local times. |
| 7 | Token scopes are `read` and `read_write`. Expiry is optional (30d, 90d or never; default 90d). Tokens are SHA-256 hashed and shown once. `lastUsedAt` is tracked. |
| 8 | Every tool call is logged to `mcpActivity` and kept for 30 days. No undo. |
| 9 | Rate limits per token with `@convex-dev/rate-limiter`: 60 writes/min, 300 reads/min, 100 calendar writes/day. |
| 10 | A new `/settings` page with an "Agents & MCP" section. |
| 11 | Delivered as three stacked PRs: refactor, then server, then UI. |

## Design principles for the code

- **One copy of the business rules.** Every public mutation used by the UI and every MCP
  tool call the same `…ForUser(ctx, userId, args)` helper.
- **No public function takes a `userId`.** MCP functions are internal, and they receive the
  *token hash*, not a user ID. They resolve the user themselves in the same transaction as
  the write, so the auth check, rate limit, write and activity log either all commit or all
  roll back.
- **Domain errors are values, not throws, inside the MCP mutations.** A tool mutation catches
  expected errors ("Task not found", "Block is read-only") and returns `{ ok: false, error }`,
  so the activity log entry and the rate-limit charge still commit. Unexpected errors still
  throw.
- **New queries are bounded** (`.take(n)`), as the Convex guidelines require. Existing
  `.collect()` calls are left alone.
- **Identity key stays `identity.subject`** to match every existing `userId` row. The
  guidelines prefer `tokenIdentifier`, but switching would mean a data migration, which is
  out of scope.

---

## PR 1 — Foundation: user-scoped helpers and timezone

No behaviour change for the UI. Every existing test must pass unchanged.

### 1.1 Move mutation handlers into user-scoped helpers

Create `convex/lib/taskOps.ts` and `convex/lib/blockOps.ts`. Move each handler body behind
a function that takes `(ctx: MutationCtx, userId: string, args)`:

| Public mutation | New helper |
|-----------------|------------|
| `tasks.create` | `createTaskForUser` |
| `tasks.update` | `updateTaskForUser` (this covers archive and unarchive through `archived`) |
| `timeBlocks.create` | `createBlockForUser` |
| `timeBlocks.update` | `updateBlockForUser` |
| `timeBlocks.remove` | `removeBlockForUser` |
| `timeBlocks.createFromTask` | `createBlockFromTaskForUser` |

Read helpers, which take `(ctx: QueryCtx, userId, args)`:

| Public query | New helper |
|--------------|------------|
| `tasks.list` | `listTasksForUser` |
| `timeBlocks.listForRange` | `listBlocksForUser` (already mostly in `lib/timeBlockQueries.ts`) |
| `projects` list | `listProjectsForUser` |
| `boardColumns` list | `listColumnsForUser` |

Each public function becomes `const userId = await requireUserId(ctx); return helper(ctx, userId, args);`.

Fix one gap along the way: `createFromTask` doesn't check `end > start`. Add the check in
the helper, with a test.

### 1.2 `userSettings` table (also covers the backlog "Foundation → User settings" item)

```ts
userSettings: defineTable({
  userId: v.string(),
  timezone: v.optional(v.string()), // IANA, e.g. "Europe/Stockholm"
  updatedAt: v.number(),
}).index("by_userId", ["userId"]),
```

- `convex/userSettings.ts`: `get` (query) and `setTimezone` (mutation). `setTimezone`
  checks the zone with `new Intl.DateTimeFormat("en-US", { timeZone })` inside a try/catch,
  and does nothing if the value hasn't changed.
- Client: a `useSyncTimezone()` hook in `AppShell` reads
  `Intl.DateTimeFormat().resolvedOptions().timeZone` once per session and calls
  `setTimezone` when it differs from the stored value.

### 1.3 Tests

- The existing `tasks.test.ts`, `timeBlocks.test.ts` and other suites pass unchanged.
- New: `userSettings.test.ts` (invalid zone rejected, saving the same value twice is a no-op,
  owner isolation).
- New: `createFromTask` rejects `end <= start`.

---

## PR 2 — MCP server

### 2.0 Spike first (half a day, throwaway branch)

Check that `@modelcontextprotocol/sdk@^1.32` (`McpServer` +
`WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined`,
`enableJsonResponse: true`) runs inside a Convex `httpAction` in the default V8 runtime.
Known risks:
- The SDK's JSON-schema validator (ajv) may need `new Function`, which the runtime may block.
- The SDK may import Node built-ins.

Run `initialize` → `tools/list` → `tools/call` with `npx @modelcontextprotocol/inspector`
against `convex dev`.

**Fallback if the SDK doesn't run:** a small JSON-RPC 2.0 handler in `convex/mcp/protocol.ts`
for `initialize`, `notifications/initialized`, `ping`, `tools/list` and `tools/call`. Tool
input schemas are written once in zod 4 (already a dependency) and converted with
`z.toJSONSchema()`. The tool layer below stays the same either way.

Also check in the spike that `Intl.DateTimeFormat` with `timeZone` works in the Convex
runtime. Formatting output times depends on it.

### 2.1 Schema

```ts
apiTokens: defineTable({
  userId: v.string(),
  name: v.string(),
  tokenHash: v.string(),        // hex SHA-256 of the full token
  prefix: v.string(),           // first 8 chars after "lp_", for display
  scope: v.union(v.literal("read"), v.literal("read_write")),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),
})
  .index("by_tokenHash", ["tokenHash"])
  .index("by_userId", ["userId"]),

mcpActivity: defineTable({
  userId: v.string(),
  tokenId: v.id("apiTokens"),
  tool: v.string(),
  ok: v.boolean(),
  summary: v.string(),          // "Archived 'Write spec'" / error message
  targetIds: v.array(v.string()),
  at: v.number(),
})
  .index("by_tokenId_and_at", ["tokenId", "at"])
  .index("by_at", ["at"]),
```

`lastUsedAt` is written at most once a minute per token, so the token row doesn't get a
write on every call.

### 2.2 Tokens — `convex/apiTokens.ts`

- `create` (public mutation, Clerk auth): takes `{ name, scope, expiresInDays: 30 | 90 | null }`.
  It builds `lp_` plus 32 random bytes in base64url with `crypto.getRandomValues`, stores the
  `crypto.subtle` SHA-256 hash, and returns the plaintext **once**. Limit of 20 active tokens
  per user.
- `list` (public query): name, prefix, scope, created/last-used/expires, revoked. The hash is
  never returned.
- `revoke` (public mutation): sets `revokedAt`.
- `lib/mcpAuth.ts`:
  - `hashToken(raw)`
  - `resolveUserFromRequest(request)`, which reads the bearer header and returns
    `{ tokenHash } | null`. The OAuth path plugs in here later.
  - `requireToken(ctx, tokenHash, needed: "read" | "write")`, called inside each tool
    function. It checks the token exists, isn't revoked or expired, and has the right
    scope, then returns `{ userId, tokenId }`.

### 2.3 HTTP route — `convex/http.ts` and `convex/mcp/server.ts`

- `POST /mcp`: the MCP endpoint.
- `GET /mcp` and `DELETE /mcp`: `405` (stateless server, no SSE stream).
- Before any MCP handling:
  - No bearer token, or a malformed one: `401` with `WWW-Authenticate: Bearer`.
  - `Origin` header present and not on an allowlist (none by default): `403`. This is the
    DNS-rebinding protection the MCP spec requires.
  - Body over 256 KB: `413`.
- The server is built per request. `tools/list` uses the token's scope, so read tokens never
  see write tools.
- The server `instructions` string tells agents:
  - Always send times with a UTC offset.
  - Call `get_context` first to get "now" and the timezone.
  - Look up IDs with `list_projects` and `list_columns` before using them.
  - Blocks with `editable: false` are the user's Google events and are read-only.
  - Archive tasks, never delete them; there is no delete tool.
  - Rate-limit errors include a retry delay.

### 2.4 Tool layer — `convex/mcp/tools.ts` (internal functions)

Every tool is an `internalMutation` that takes `{ tokenHash, ...args }`. Reads are mutations
too, so they can charge the rate limiter and write the log. Each one runs these steps:

1. `requireToken(ctx, tokenHash, scope)`
2. `rateLimiter.limit(ctx, bucket, { key: tokenId })` → `{ ok: false, retryAfter }` if over the limit
3. Convert ISO inputs to milliseconds (`lib/mcpTime.ts`)
4. Call the `…ForUser` helper from PR 1
5. Insert an `mcpActivity` row
6. Return the result as JSON, with times formatted in the user's zone

| Tool | Scope | Bucket | Notes |
|------|-------|--------|-------|
| `get_context` | read | read | Now (ISO, local), timezone, today's date key, the done column ID. Errors if no timezone is stored yet ("open the app once"). |
| `list_tasks` | read | read | Filters: `archived` (default false), `projectId`, `columnId`, `scheduledDate`, `dueBefore`, `limit` (default 50, max 200). Returns compact rows. |
| `get_task` | read | read | Full task, checklist, notes and linked blocks (via `listForTask` logic). |
| `list_projects` | read | read | Active projects by default; `includeArchived` flag. |
| `list_columns` | read | read | Ordered, with `isDone`. |
| `list_calendar` | read | read | `start` and `end` ISO, max 31 days. Each block has `editable: origin === "app"`, linked task IDs and `syncState`. |
| `create_task` | read_write | write | Same fields as `tasks.create`. |
| `update_task` | read_write | write | Same fields as `tasks.update`, except `archived` (archiving has its own tools). |
| `archive_task` / `unarchive_task` | read_write | write | Thin wrappers over `updateTaskForUser({ archived })`. |
| `create_block` | read_write | write + calendar | `title`, `start`, `end`, optional `taskIds`. |
| `update_block` | read_write | write + calendar | Rejects a `google`-origin block with `"This is an imported Google Calendar event and is read-only"`. |
| `delete_block` | read_write | write + calendar | Same origin check. Uses `scheduleBlockDelete`. |
| `schedule_task` | read_write | write + calendar | `taskId`, `start`, and either `end` or `durationMinutes` (falls back to the task's `estimateMinutes`). |

Rate limiter (`convex/convex.config.ts` is new; it mounts `@convex-dev/rate-limiter`):
```ts
read:     { kind: "token bucket", rate: 300, period: MINUTE }
write:    { kind: "token bucket", rate: 60,  period: MINUTE }
calendar: { kind: "fixed window", rate: 100, period: DAY }
```

`lib/mcpTime.ts`:
- `parseIsoWithOffset(s)` rejects strings that don't end in `Z` or `±HH:MM`.
- `formatLocal(ms, tz)` formats a timestamp in the user's zone.
- `dateKeyInZone(ms, tz)` returns the local date key.

### 2.5 Retention cron

`crons.interval("purge mcp activity", { hours: 24 }, internal.mcp.activity.purgeOld)` deletes
rows older than 30 days, 500 at a time. If a batch is full, it schedules itself again.

### 2.6 Tests (`convex/mcp/*.test.ts`, convex-test)

- **Auth:** missing, malformed, unknown, revoked and expired tokens are rejected. A `read`
  token gets an error on write tools, and `tools/list` doesn't show them.
- **Ownership:** user A's token can't read or modify user B's tasks or blocks.
- **Tasks:** create, update, archive and unarchive work, and there is no delete tool.
- **Calendar:** creating and updating blocks schedules `google.outbound.syncBlock`.
  `update_block` and `delete_block` on a `google`-origin block return a read-only error and
  still write a log row.
- **Time:** inputs without an offset are rejected; DST-boundary formatting is correct.
  `get_context` errors when no timezone is stored.
- **Rate limits:** the 61st write in a minute returns `retryAfter`. The calendar daily cap
  works separately from the write limit.
- **Activity and retention:** every call writes one row, including failed calls. The purge
  removes only rows older than 30 days.
- **HTTP layer:** 401, 403 (Origin), 405 (GET) and 413 responses. `initialize` and
  `tools/list` round-trip through `t.fetch("/mcp", …)`.
- **Manual end-to-end:** `claude mcp add --transport http life-planner http://<dev>.convex.site/mcp --header "Authorization: Bearer …"`,
  then ask Claude to create, schedule and archive a task, and check that the event appears
  in Google Calendar.

---

## PR 3 — Settings page

### 3.1 Route and nav

- `src/routes/_authenticated/settings.tsx`
- A link from the `AppUserButton` menu (Clerk `UserButton.Link`) and the sidebar footer.

### 3.2 Sections

1. **General:** the detected timezone, read-only, with a note that it comes from the browser.
2. **Agents & MCP**
   - "New token" dialog: name, scope (Read only / Read & write), expiry (30 days / 90 days /
     Never).
   - A one-time reveal with a copy button and the warning "you won't see this again".
   - Connection snippets with the endpoint URL filled in (`VITE_CONVEX_URL` with `.cloud`
     replaced by `.site`) and the new token included while it's still on screen:
     - **Claude Code:** `claude mcp add --transport http life-planner <url> --header "Authorization: Bearer <token>"`
     - **Cursor / generic JSON:** `{ "mcpServers": { "life-planner": { "url": "<url>", "headers": { "Authorization": "Bearer <token>" } } } }`
     - **Codex:** a `config.toml` block with `url` and `bearer_token_env_var`. Check the
       current Codex syntax when building this.
   - Token table: name, `lp_abcd1234…`, scope, last used, expires, and Revoke (with
     `ConfirmDialog`).
   - Each token row expands to show its last 50 `mcpActivity` entries, with time, tool,
     summary and failures highlighted. This needs a new `mcpActivity.listForToken` public
     query (Clerk auth, ownership checked, bounded).
3. **Google Calendar:** for now, link to or reuse the existing `ConnectGoogleCalendar`
   control. Moving it out of the sidebar can happen later.

### 3.3 Tests

- Component tests for the reveal-once behaviour and the snippet URL.
- Playwright (`e2e/`): open settings, create a token, see it revealed, revoke it, and see it
  marked revoked.

---

## Later (not in v1)

- OAuth 2.1 via Clerk for claude.ai and mobile connectors. It plugs into `resolveUserFromRequest`.
- Undo from the activity log.
- Write access to imported Google events.
- Tools for writing projects and columns, reordering, day intentions and reviews.
- Per-tool scopes.

## Risks

| Risk | Mitigation |
|------|------------|
| The MCP SDK doesn't run in the Convex V8 runtime | The 2.0 spike, with the hand-written JSON-RPC fallback |
| `Intl` timezone support is incomplete in the runtime | Checked in the spike; fallback is an offset table computed client-side and stored with the zone |
| The PR 1 refactor changes behaviour without anyone noticing | Pure moves only, existing tests unchanged, reviewed on its own before PR 2 |
| An agent floods Google Calendar | The 100/day calendar bucket, and block writes are logged |
| A token leaks from an agent config file | `lp_` prefix for secret scanners, 90-day default expiry, one-click revoke, activity log |
