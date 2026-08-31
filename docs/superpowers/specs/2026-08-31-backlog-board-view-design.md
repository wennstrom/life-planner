# Backlog Board View Design

**Date:** 2026-08-31  
**Status:** Approved (pending implementation)

## Goal

Add a Board tab on the Backlog page so tasks can be triaged by workflow status: drag cards between columns (and reorder inside a column) to change status and order; click a card to open the existing edit modal. Keep the current table as a second tab.

## Context

`/backlog` is a single table (`BacklogTasksTable`) fed by `api.backlog.get`, which returns non-done tasks grouped by project. Statuses on a task are `backlog | investigate | in-progress | review | test | done`. The table already supports inline status changes, row-click to edit, Plan, and Delete.

There is no board UI and no drag-and-drop library. `tasks.order` is a single integer per task, used as the default sort in `backlog.get`. `tasks.reorder` rewrites global 0..n order and is unused in the UI. `tasks.update` sets `completedAt` when status becomes `done` and clears it otherwise.

The app already has shadcn `Tabs` (`src/components/ui/tabs.tsx`).

## Decisions

- Tabs: **Table** (existing) and **Board** (new), on `/backlog`.
- Board columns, left to right: **Investigate → In Progress → Review → Test → Done**.
- Tasks with status `backlog` do **not** appear on the board; they remain on the table.
- Done column lists completed tasks (uncapped). The table tab still excludes Done.
- Drag-and-drop updates **status and order**.
- Click (no drag) opens `EditTaskModal`.
- Project filter is **shared** across tabs.
- New tasks still default to `backlog`, so they show on Table until status moves to a board column.

## Non-goals

- No Backlog column, WIP limits, swimlanes, or collapsed columns.
- No Plan/Delete/status dropdown on cards (modal + table keep those).
- No nested `/backlog/board` route (use a search param instead).
- No mobile-specific board layout beyond horizontal scroll.
- Do not change `api.backlog.get` behavior.
- Do not use `tasks.reorder` for board drops.

## Architecture

Stay on `/backlog`. Tabs sit under the existing header and project filter. Active tab is `?view=table|board` (default `table`).

| Path | Role |
| --- | --- |
| `api.backlog.get` | Table: non-done tasks, grouped by project. Unchanged. |
| `api.backlog.board` (new) | Board: tasks in the five board statuses, grouped into columns, same enrichment as `get`. |
| `api.tasks.moveOnBoard` (new) | One transaction: set status (`completedAt` same rules as `tasks.update`) and place the task in the destination column order. |
| Existing add/update/remove | Add task, edit modal, Plan, Delete. |

Both queries may stay subscribed so tab switches are instant. Filter is client-side on the visible view.

## UI

### Page chrome

- Title **Backlog**, **+ Add task**, project `Select` unchanged and above tabs.
- Tabs: **Table** | **Board**.
- Header count:
  - Table: existing `data.total` (non-done).
  - Board: count of tasks actually shown (five statuses, after project filter). Does not include `backlog` tasks.

### Board

- Five columns; header uses the same status colors as `STATUS_CONFIG` in `BacklogTasksTable`.
- Column header shows label + count. Empty columns remain droppable.
- Horizontal scroll on narrow viewports.

### Cards

- Title (strikethrough when Done).
- Project badge, due-date badge (same overdue / this-week / muted rules as the table), Active badge when `active`, estimate when set.
- No inline status control, Plan, or Delete on the card.

### Drag vs click

- Pointer movement starts a drag; a click with no move opens the modal.
- `@dnd-kit` with `DragOverlay`. Keyboard sensor enabled so cards can be moved without a mouse.

## Data model

No schema change. Reuse `tasks.status` and `tasks.order`.

Board statuses (validator for `moveOnBoard` destination):

```
investigate | in-progress | review | test | done
```

`moveOnBoard` must reject destination `backlog`. Moving *to* backlog remains possible via the edit modal or table dropdown; the card then disappears from the board.

## `api.backlog.board`

Args: none (same auth as `get`: `requireUserId`).

Returns:

```ts
{
  total: number, // tasks on the board (excludes backlog status)
  columns: Array<{
    status: "investigate" | "in-progress" | "review" | "test" | "done"
    tasks: Array<task + { project, stats, active }>
  }>
}
```

Rules:

- Load the user's tasks; keep only board statuses.
- Enrich exactly as `get` (project map, `buildTaskStatsMap`, `isTaskActive`).
- Always return five columns in the order above, even if empty.
- Sort each column by `order` ascending, then `_id` as a tiebreaker.
- Include Done with no date/count cap.

## `api.tasks.moveOnBoard`

Args:

- `taskId`: `Id<"tasks">`
- `status`: board status union (not `backlog`)
- `beforeTaskId`: optional `Id<"tasks">` — insert immediately before this task in the destination column. Omit to append.

Behavior (one mutation):

1. `getOwnedTask`; throw `"Task not found"` if missing or other user.
2. If `beforeTaskId` is set: load it; same ownership check; it must already have the destination `status` and must not be `taskId`.
3. Patch the moved task: `status`; `completedAt = Date.now()` if `status === "done"`, otherwise `completedAt = undefined` (same as `tasks.update`).
4. Load all of the user's tasks with that destination `status` (including the moved task), sorted by current `order` then `_id`.
5. Build the new sequence: remove the moved task, then insert it before `beforeTaskId`, or at the end if omitted.
6. Write `order = 0..n-1` on **destination-status tasks only**. Other statuses keep their `order` values.

Same-position drop (already in that status and same index) is a no-op after the sequence is computed (still OK to patch nothing).

**Table interaction:** Unsorted table order uses global `order`. Rewriting only the destination column can cluster those tasks in the default table sort. That is accepted: the table has column sorting, and board order is the workflow order that matters.

## Client data flow

1. **Filter** (`all` | `none` | project id) applies to table rows and to each board column. Columns are never hidden by filter.
2. **Drop:** compute `status` + `beforeTaskId` → optimistic move in local column state → `moveOnBoard`. Subscription refreshes `board` and `get`.
3. **Click:** `setEditingTask` → existing `EditTaskModal`. Modal `tasks.update` status changes move the card (or remove it if status becomes `backlog`).
4. **Add task:** default `backlog` → Table only until status is a board status.

## Error handling

- Unauthenticated: existing `requireUserId` behavior.
- Unknown / other-user `taskId` or `beforeTaskId`: `"Task not found"` (no leak).
- `beforeTaskId` not in destination status: throw a clear error, e.g. `"Invalid drop target"`.
- Client: on mutation failure, discard optimistic state so the Convex query is the source of truth. Do not add a toast library for v1. Do not leave the card stuck in the wrong column.
- Rapid drops: Convex OCC retries; last successful write wins. Do not debounce away the latest drop.

## Files

- Modify: `src/routes/_authenticated/backlog.tsx` — tabs, search param, shared filter, board query.
- Modify: `convex/backlog.ts` — add `board` query.
- Modify: `convex/tasks.ts` — add `moveOnBoard`.
- Modify: `convex/tasks.test.ts` / add `convex/backlog.test.ts` as needed.
- Add: `src/components/tasks/BacklogBoard.tsx` (columns + dnd).
- Add: `@dnd-kit/core` and `@dnd-kit/sortable` (and utilities as required).
- Reuse: `EditTaskModal`, `AddTaskModal`, `AddTimeBlockModal`, `ConfirmDialog`, `Tabs`, `STATUS_CONFIG` colors (extract shared status config if table and board would otherwise duplicate).

## Testing

### Convex (`convex-test`)

- `board` returns five columns in order; empty columns present.
- Excludes `backlog`; includes `done`.
- Enrichment: project, stats, active.
- Auth: other user's tasks never appear.
- `moveOnBoard`: cross-column status change; append vs insert before; destination-only order rewrite; `completedAt` set/cleared; rejects other-user task; rejects `beforeTaskId` in the wrong column; rejects destination `backlog`.

### UI / e2e

- Tabs switch Table ↔ Board; `?view=board` restores Board.
- Shared project filter applies to both tabs.
- Click card opens edit modal; drag does not open modal.
- Drop onto another column updates status; drop between cards updates order.
- New task (default backlog) visible on Table, not Board.

Manual browser pass for drag-and-drop (Playwright DnD is optional if flaky; Convex tests are the source of truth for move semantics).
