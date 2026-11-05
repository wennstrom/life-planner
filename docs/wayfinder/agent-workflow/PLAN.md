# Agent workflow on the MCP server — Plan

**Status:** In progress (2026-11-05). Covers the 10 backlog tasks tagged `[Agent MCP]`.
Builds on the merged MCP server (PRs #47–#49, `convex/mcp/*`, `docs/wayfinder/mcp-server/PLAN.md`).

## Goal

Let agents pull work from the board safely: the human marks what may be pulled, agents claim a
task with a lease, respect blockers, hand work back with a structured summary, and never mark
work Done themselves (unless the user allows it).

## Delivery

| Wave | Branch | Backlog tasks |
|------|--------|---------------|
| 1 | `feature/agent-workflow-foundation` | Review column · Gate: agents cannot move to Done · Pullable flag · Blocked-by · Audit log: agent id + session |
| 1 | `feature/task-labels` | Task labels / epic grouping |
| 1 | `feature/project-agent-context` | Project context for agent cold start |
| 2 | `feature/agent-claims-handoff` (stacked on foundation) | Claim / lease · list_pullable_tasks · complete_work handoff |

Every branch starts from `origin/main` (wave 2 from the foundation branch). They all touch
`convex/schema.ts`, `convex/mcp/toolDefs.ts`, `convex/mcp/handlers.ts` and the server
instructions; keep additions self-contained so merge conflicts stay trivial.

## Shared rules (same as the MCP server plan)

- One copy of the business rules: `…ForUser(ctx, userId, args)` helpers in `convex/lib/`,
  called by both public functions (Clerk auth) and MCP handlers.
- Expected failures throw plain `Error("…")` / `ConvexError` so `mcp/tools.ts` logs them and
  returns them to the agent. Messages are written for an agent to act on.
- New queries are bounded (`.take(n)`) and use indexes, no `.filter`.
- New fields are `v.optional` so existing rows stay valid; no data migration is required to
  deploy. One-off backfills are `internalMutation`s the user runs by hand.
- Every new MCP tool is in `toolDefs.ts` with a zod schema, a scope and a rate bucket, and
  has convex-test coverage through `internal.mcp.tools.call`.

## Decisions

### 1. Agent identity and session (audit log)

- **Agent** = the API token. Its display name is the token `name` (e.g. "Claude Code laptop").
- **Session** = a string the agent picks per run. Sent as the HTTP header
  `X-Agent-Session` (≤128 chars, `[A-Za-z0-9._:-]`), read in `mcp/server.ts`, passed to
  `tools.call` as `sessionId`. Tools that need it (claims, `complete_work`) also accept a
  `sessionId` argument, which wins over the header. Missing header → `undefined`.
- `mcpActivity` gains `agent: v.optional(v.string())` (token name snapshot) and
  `sessionId: v.optional(v.string())`. Every logged call fills them.
- The Settings activity list shows the session next to each row.
- Server instructions tell agents to send `X-Agent-Session` or pass `sessionId`.

### 2. Review column

- `DEFAULT_BOARD_COLUMNS` gets **Review** between Test and Done.
- `internal.migrations.addReviewColumn` (run by hand): for each user with no column whose
  normalised name is `review`, insert Review directly before the done column and shift orders.
  Idempotent.
- Column lookup by role uses normalised names: `findColumnByName(ctx, userId, "test" | "review" | "in progress")`.
  Tools that need a missing column fail with "Add a Test column to your board".

### 3. Gate: agents cannot move to Done

- `userSettings.agentsCanMarkDone: v.optional(v.boolean())`, default false.
- Enforced server-side in MCP code only (UI is unaffected): `create_task`, `update_task`,
  `complete_work` and anything else that would put a task in the done column fail with
  "Agents can't mark tasks done. Move it to Review; the user moves Review → Done." unless the
  setting is on.
- Public mutation `userSettings.setAgentsCanMarkDone({ value })`; toggle in Settings →
  Agents & MCP. `get_context` reports `agentsCanMarkDone` and the Test/Review column IDs.

### 4. Pullable flag

- `tasks.pullable: v.optional(v.boolean())`. Human-only: set in the task detail UI
  (toggle "Agents may pick this up") and shown as a small badge on board cards.
- MCP `update_task` / `create_task` do **not** accept `pullable`. Agent-created tasks are
  never pullable.
- `list_tasks` and `get_task` return `pullable`.

### 5. Blocked-by

- Table `taskBlockers { userId, taskId, blockerTaskId, createdAt }`, indexes
  `by_task` `["taskId"]`, `by_blocker` `["blockerTaskId"]`.
- Rules (in `lib/taskBlockers.ts`): both tasks owned by the user; no self-edge; no duplicate;
  no cycles (bounded DFS, depth ≤ 50); max 20 blockers per task.
- A blocker is **open** while it is not done and not archived.
- Deleting a task (UI) removes its edges in both directions.
- Public: `taskBlockers.add / remove / listForTask`. UI: "Blocked by" section in task detail
  with a task picker, remove buttons, and a "blocked" badge on cards with open blockers.
- MCP: `add_blocked_by { taskId, blockerTaskId }`, `remove_blocked_by { … }` (write scope).
  `get_task` returns `blockedBy: [{ id, title, open }]` and `blocking: [{ id, title }]`.
- "Reject claim when blockers remain" is enforced by `claim_task` (wave 2) using
  `openBlockersForTask`.

### 6. Claim / lease (wave 2)

- Table `taskClaims { userId, taskId, tokenId, agent, sessionId, claimedAt, expiresAt }`,
  indexes `by_task`, `by_expiresAt`. At most one row per task.
- A claim is **active** while `expiresAt > now`. Expired claims count as released
  immediately; an hourly cron deletes expired rows in bounded batches.
- `claim_task { taskId, sessionId?, leaseMinutes? = 30 (max 120) }` requires a session.
  Rejects: not pullable, archived, done, open blockers (names them), actively claimed by a
  different session. Same session → extends. Moves the task to the "In Progress" column if
  one exists.
- `heartbeat_claim { taskId, sessionId?, leaseMinutes? }` extends; fails if not held.
- `release_claim { taskId, sessionId? }` deletes the claim.
- While a task is actively claimed, MCP writes to it (`update_task`, `archive_task`,
  `schedule_task`, `complete_work`, blocker edits) from a different session fail with
  "Claimed by <agent> until <time>".
- Human: `taskClaims.forceRelease({ taskId })` public mutation; task detail shows
  "Claimed by <agent> · session · expires in N min" with a Release button; cards show a
  robot badge while claimed.
- `get_task` returns `claim: { agent, sessionId, expiresAt } | null`.

### 7. list_pullable_tasks (wave 2)

- Read tool. Returns tasks that are pullable, not archived, not done, have no open blockers
  and no active claim. Args: `projectId?`, `labelId?` (only if labels exist on the branch),
  `limit?` (default 20, max 100). Sorted by priority, then board order.
- Token-cheap rows: `id, title, priority, projectId, estimateMinutes, dueDate`.

### 8. complete_work handoff (wave 2)

- `complete_work { taskId, sessionId?, summary, testList: string[], nextSteps: string[],
  tester: "agent" | "user", followUps?: [{ title, notes? }] (max 10) }`.
- Requires the caller's active claim. Persists a row in
  `taskHandoffs { userId, taskId, tokenId, agent, sessionId, summary, testList, nextSteps,
  tester, followUpTaskIds, at }` (index `by_task`), moves the task to **Test**, releases the
  claim, creates follow-ups (same project, backlog, not pullable, each blocked-by nothing)
  through a `createFollowUpForUser` helper.
- `get_task` returns the latest handoff. Task detail UI shows the handoff history (summary,
  test checklist, next steps, tester, follow-up links).

### 9. Project context

- `projects.agentContext: v.optional(v.string())` (≤ 10,000 chars, markdown). Edited in the
  project detail page under "Context for agents", with the hint "No secrets — say where to
  get them instead".
- MCP `get_project_context { projectId }` → `name, description, agentContext, health,
  goalDate, openTaskCount`. `list_projects` adds `hasAgentContext`.

### 10. Labels

- Table `labels { userId, name, color, order }`, index `by_user`. Max 50 per user, names
  unique per user (normalised).
- `tasks.labelIds: v.optional(v.array(v.id("labels")))`, max 10 per task, owned labels only.
  Deleting a label removes it from tasks (bounded batch, reschedule if more).
- UI: manage labels (create / rename / recolour / delete) in Settings; assign in task
  detail; chips on board cards; label filter on the board.
- MCP: `list_labels`; `labelIds` on `create_task` / `update_task`; `labelId` filter on
  `list_tasks`; `get_task` returns label names.
- `internal.labels.fromTitlePrefixes { userId }` (run by hand): turns `[Foo] title` into
  label "Foo" + title "title".

## Wave 1 implementation notes

Built on `feature/agent-workflow-foundation`. Where the code goes beyond or differs from the
decisions above:

- **Session plumbing.** `lib/agentSession.ts` has `isValidSessionId` and
  `effectiveSessionId(input, header)` (a valid `sessionId` argument wins). A malformed
  `X-Agent-Session` header gets HTTP 400; `tools.call` also rejects a malformed `sessionId`.
  Handlers get the caller as `user.caller: { tokenId, agent, sessionId }`.
- **Review column.** `addReviewColumn` takes an optional `cursor`, works through
  `boardColumns` 100 rows at a time and schedules itself for the rest. Boards already at the
  8-column limit are skipped (logged). `findColumnByName` now includes a named column even when it has the done role
  (wave 2), so moves must pass `agentGate`. `requireColumnByName` throws "Add a Test column to your board" and friends.
- **Gate.** `lib/agentGate.ts` → `assertAgentMayPlaceInColumn`. A task that is already in
  Done may stay there (an agent can still edit it). `get_context` returns `testColumnId` /
  `reviewColumnId` as `null` when the column is missing.
- **Pullable.** Set through its own public mutation `tasks.setPullable`, not `tasks.update`,
  so the shared update args never carry it.
- **Blocked-by.** `taskBlockers` has an extra `by_userId` index so the board can count open
  blockers for every card in one read (`openBlockerCountsForUser`, returned as
  `openBlockerCount` by `backlog.board` / `backlog.get`). `removeBlockerForUser` returns
  `false` when there was no link; `remove_blocked_by` turns that into an error. Wave 2 uses
  `openBlockersForTask(ctx, userId, taskId)`.

## Wave 2 implementation notes

- **Claims.** One operational row per task, protected by indexed transactional reads.
  Ownership requires both token ID and session, including renewals and every claimed-task
  MCP write. Calendar edits check existing and replacement task memberships; blocker edits
  check both tasks. Humans retain edit access and can force-release an owned task.
- **Time.** Expiry is exclusive (`expiresAt > now`), independent of cleanup. UI queries take
  a client-supplied clock; badges/detail refresh every 30 seconds and at the lease expiry.
  An hourly interval removes expired rows in batches of 100 and schedules continuation.
- **Discovery.** `list_pullable_tasks` scans at most 200 indexed pullable candidates, narrowed
  by owned project when supplied; labels reuse the existing owned label helpers. Rows sort
  by priority (unset last), then board order. `truncated`, `scanLimited`, `scanned` and a
  notice make scan caps explicit; when capped, sorting covers that scan, not the whole board.
- **Handoffs.** `complete_work` runs in the tool's existing nested transaction. Missing Test,
  the done gate, or invalid follow-ups preserve the claim and leave no partial changes.
  Follow-ups are same-project backlog tasks without pullability or blockers. Handoff input
  caps: summary 10,000 characters, 50 tests/next steps of 2,000 characters each, 10 follow-ups
  with the existing title/notes limits. `get_task.latestHandoff` holds the newest handoff.
- **Human history.** Task detail History shows the latest 50 handoffs (with an explicit
  notice when older entries exist), testing responsibility and openable follow-up details.
  Deleted follow-ups remain labelled as deleted; deleting the original cleans its claims
  and handoffs in bounded batches without deleting follow-up tasks or changing the bounded
  dependency cleanup from wave 1.

## Out of scope

Per-tool scopes, OAuth, multi-user workspaces (the "workspace setting" is per-user
`userSettings`), automatic Review → Done.
