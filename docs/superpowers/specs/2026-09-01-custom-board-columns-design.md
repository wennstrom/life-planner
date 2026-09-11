# Custom Board Columns Design

**Date:** 2026-09-01
**Status:** Draft (awaiting user review)
**Amends:** `docs/superpowers/specs/2026-08-31-backlog-board-view-design.md`

## Goal

Let each account define their own board workflow: named columns, count, and colors. **Backlog is not a status.** A task is in Backlog when it has no column. The Backlog page shows the **same tasks** in a Board view and a Table view. Defaults: **In-Progress, Test, Done**.

## Context

Today `/backlog` has two tabs with **different** task sets:

- **Backlog** (table): `status === "backlog"` only.
- **Active** (board): hardcoded columns `investigate | in-progress | review | test | done`.

`tasks.status` is a required union of six literals. New tasks default to `backlog`. `completedAt` follows the `done` literal. `isTaskActive` treats `done` as inactive.

There is no per-user settings table. `userId` is the Clerk subject string.

## Decisions

- Scope: **per account**, one workflow for all of that user’s tasks. Not per project, not app-wide.
- Data: `boardColumns` table + optional `tasks.columnId`. Unset `columnId` = Backlog.
- Terminal column: always last, name locked to **Done**, not deletable, not reorderable off the end. Color is choosable. `completedAt` follows this column only.
- Defaults for new (or unseeded) users: In-Progress, Test, Done.
- Column count: **2–8** (at least one workflow column + Done).
- Colors: **fixed palette only** (see UI). No arbitrary hex.
- Settings: button on the Backlog page opens a dialog (names, colors, add/remove/reorder). Board also supports inline rename (except Done), add-before-Done, and column remove.
- Remove a non-Done column that still has tasks: confirm **Delete those tasks** or **Move to Backlog** (clear `columnId`). Empty column: light confirm, no disposition choice required beyond delete.
- Views: **Board | Table** toggle on `/backlog` (`?view=board|table`, default **board**). Same task set, including Done. Shared project filter.
- Board layout, left to right: **Backlog** (not a `boardColumns` row) | user columns | **Done**. Drag onto a column or back to Backlog to clear `columnId`.
- New tasks default to **no column**. Add-from-column still assigns that column.
- Migration: `in-progress` / `test` / `done` map to the three default columns; `backlog` / `investigate` / `review` become unset `columnId` (Backlog). Do not keep Investigate or Review as columns.

## Non-goals

- Per-project workflows, WIP limits, swimlanes, collapsed columns.
- Custom hex colors, color per card, or more than one Done column.
- Renaming or deleting Done.
- Dragging from the board onto the Table view (toggle is layout-only).
- Nested `/backlog/board` route.
- New toast library.
- Changing Today, calendar, or time-block review beyond reading “is this Done?” via the Done column / `completedAt`.

## Architecture

Stay on `/backlog`. Header: title, count of **visible** tasks after project filter, **Settings**, **+ Add task**. Project filter, then Board | Table toggle.

Queries cannot insert defaults. The client calls `boardColumns.ensureDefaults` once when `list` is empty (first visit after deploy or new user). `list` / `board` / `get` stay read-only.

| Path | Role |
| --- | --- |
| `api.boardColumns.list` | Columns in `order` (Done last). Empty until `ensureDefaults` runs. |
| `api.boardColumns.ensureDefaults` | If the user has zero columns, insert In-Progress, Test, Done. Idempotent. |
| `api.boardColumns.save` | Update names, colors, and order of existing columns; add new non-Done columns. Enforces limits and Done last. |
| `api.boardColumns.remove` | Remove one non-Done column. `disposition: "delete-tasks" \| "move-to-backlog"` required if any tasks still point at it. |
| `api.backlog.board` | Columns: synthetic Backlog + each `boardColumns` row. Cards enriched (project, stats, active). |
| `api.backlog.get` | Same tasks as the board (including Done), still grouped by project (including a “No project” group). The table flattens groups after the shared project filter, as it does today. |
| `api.tasks.moveOnBoard` | Destination: a `columnId` **or** Backlog (clear `columnId`). `beforeTaskId` for insert position. Destination-only `order` rewrite. |
| `api.tasks.create` / `update` | `columnId` optional. `completedAt` set iff the assigned column is Done; cleared when leaving Done. |

Table and board both subscribe so the toggle is instant.

## Data model

### `boardColumns`

```ts
defineTable({
  userId: v.string(),
  name: v.string(),
  color: v.string(), // must be one of BOARD_COLUMN_COLORS
  order: v.number(),
  isDone: v.boolean(),
})
  .index("by_user", ["userId"])
  .index("by_user_order", ["userId", "order"])
```

Invariants (enforced in mutations, not schema):

- Exactly one `isDone: true` per user.
- That row has `name === "Done"` and the highest `order`.
- `2 <= count <= 8`.
- Names unique per user after trim; case-insensitive.
- `color` ∈ `BOARD_COLUMN_COLORS`.

Default seed (order 0, 1, 2):

| name | isDone | color |
| --- | --- | --- |
| In-Progress | false | blue from palette |
| Test | false | yellow from palette |
| Done | true | green from palette |

Stable ids: tasks reference `_id`. Rename does not rewrite tasks.

### `tasks`

Widen, backfill, then narrow:

1. Add `columnId: v.optional(v.id("boardColumns"))`. Keep `status` during migration.
2. Backfill as specified below.
3. Remove `status` and the `by_user_status` index. Add `by_user_columnId` on `["userId", "columnId"]`.

`completedAt` stays. “Done” for `isTaskActive` and UI strikethrough: the task’s `columnId` is the user’s `isDone` column (load that id once per query). Treat missing column (deleted/orphan) as Backlog, not Done.

`order` remains a per-task integer. `moveOnBoard` rewrites `order` only for tasks in the **destination** bucket (one real column, or the Backlog unset group).

## UI

### Palette

Fixed swatches, not a color input. Reuse the five project colors and the current status hues so defaults stay recognizable:

```ts
export const BOARD_COLUMN_COLORS = [
  '#6366f1', // indigo (projects)
  '#3b82f6', // blue — default In-Progress
  '#22c55e', // green — default Done
  '#eab308', // yellow — default Test
  '#f97316', // orange
  '#ec4899', // pink
  '#a855f7', // purple
  '#14b8a6', // teal
] as const
```

Settings and any board color control pick from this list only.

### Settings dialog

Opened from a **Settings** button on `/backlog`.

- Ordered rows: name input, color swatches, up/down (hidden or disabled on Done).
- Add column: append **immediately before Done**.
- Remove: trash on non-Done rows. If that column’s task count is 0, confirm delete. If count > 0, dialog: **Delete N tasks** or **Move N tasks to Backlog**.
- Done row: color only; name shown read-only; no remove; no move.

Saving names/colors/order uses `save`. Remove uses `remove` (can be immediate per row, not only on dialog save).

### Board

- Horizontal scroll. Column header: color tint, name, count.
- **Backlog** header is not inline-editable and has no color picker or remove.
- Other headers: click name to rename (Done locked). Column menu: remove (same confirm as Settings).
- Control after the last non-Done column: add column (insert before Done).
- Cards: same content as today (title, project, due, Active, estimate). Click opens edit modal; pointer move starts drag.
- Drop on Backlog clears `columnId`. Drop on a named column sets `columnId`. Keyboard sensor remains enabled.

### Table

- Same tasks as the board after project filter, including Done.
- Status control: **Backlog** plus each column name in order. Choosing Backlog clears `columnId`.
- Plan / Delete / row-click edit unchanged.

### Create / edit modals

- Status field uses the same list. Default create: Backlog (omit `columnId`).
- Column header **+** on the board still opens add-task with that column preselected (Backlog + means no column).

## `moveOnBoard`

Args:

- `taskId`
- `columnId`: `v.optional(v.id("boardColumns"))` — omit or `null` for Backlog. Convex: use `v.union(v.id("boardColumns"), v.null())` and pass `null` for Backlog.
- `beforeTaskId`: optional; must already be in the destination bucket.

Behavior in one mutation:

1. `getOwnedTask`.
2. If `columnId` is set, load it; must belong to the user. If `beforeTaskId` is set, same ownership; it must be in that destination (same `columnId`, or both unset for Backlog) and not be `taskId`.
3. Patch `columnId`; if destination is Done, `completedAt = Date.now()` when **entering** Done; if leaving Done, `completedAt = undefined`; intra-Done reorder does not change `completedAt`.
4. Load destination-bucket tasks (including the moved one), sort by `order` then `_id`, remove moved, insert before `beforeTaskId` or append, write `order = 0..n-1` on that bucket only.

## Migration

Per user, in a migration or in `ensureDefaults` + a one-shot backfill:

1. If the user has no `boardColumns`, insert the three defaults.
2. Map existing `tasks.status`:
   - `in-progress` → In-Progress column id
   - `test` → Test column id
   - `done` → Done column id
   - `backlog`, `investigate`, `review` → unset `columnId`
3. After all tasks are backfilled, remove `status` from the schema.

Users who already have only the six literals and never visit `/backlog` still get columns + mapping from the migration so Today / `isTaskActive` keep working.

## Error handling

- Unauthenticated: `requireUserId`.
- Unknown or other-user task, column, or `beforeTaskId`: `"Task not found"`.
- `beforeTaskId` not in destination: `"Invalid drop target"`.
- `save` / `remove`: empty name, duplicate name, color not in palette, count outside 2–8, mutating Done’s name/`isDone`/position, removing Done → throw a specific message (e.g. `"Done cannot be removed"`).
- `remove` with tasks and missing/invalid `disposition`: reject.
- `ensureDefaults` is a no-op when columns already exist.
- Client: on mutation failure, drop optimistic state; query is source of truth. OCC: last successful write wins.

## Testing

### Convex (`convex-test`)

- `ensureDefaults` inserts three columns once; second call is a no-op.
- `save` updates name/color/order; rejects Done rename, palette miss, duplicates, bounds.
- `remove` move-to-backlog clears `columnId`; delete-tasks deletes only that column’s tasks; reject remove Done; reject remove with tasks and no disposition.
- `board` always includes a Backlog bucket plus every column (empty columns present).
- `get` includes Done and Backlog tasks.
- `moveOnBoard`: to a column, to Backlog, append vs before, destination-only order, `completedAt` only when entering/leaving Done.
- Auth: other user’s columns and tasks never appear.
- Backfill mapping: investigate/review/backlog unset; in-progress/test/done mapped.

### UI

- Toggle Board ↔ Table; `?view=table` restores table; default board.
- Shared project filter.
- Settings: add/remove/reorder/color; Done locked.
- Remove column confirm: both dispositions.
- Drag Backlog → column and column → Backlog.
- New task appears in Backlog until assigned.

Manual browser pass for drag-and-drop. Convex tests are source of truth for move/remove semantics.

## Files (expected)

- Add: `convex/boardColumns.ts`, `convex/boardColumns.test.ts`, `convex/lib/boardColumnColors.ts`
- Modify: `convex/schema.ts`, `convex/tasks.ts`, `convex/backlog.ts`, `convex/lib/taskStats.ts`, related tests
- Modify: `src/routes/_authenticated/backlog.tsx`, `BacklogBoard.tsx`, `BacklogTasksTable.tsx`, `task-status.ts`, add/edit task forms, `backlog-board.ts`
- Add: settings dialog component for columns
- Remove: hardcoded `BOARD_COLUMN_STATUSES` / six-literal `TASK_STATUSES` after narrow

## Out of scope follow-ups

- Per-project column sets.
- Dragging a card onto the Table toggle.
- WIP limits / column collapse.
