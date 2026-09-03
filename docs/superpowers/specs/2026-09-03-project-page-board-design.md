# Project Page Board and Header — Design

**Date:** 2026-09-03
**Status:** Approved (design phase)

## Purpose

The project detail page (`/projects/$projectId`) should be where you **see**
one project (identity + progress) and **run** its work on the same custom
columns as Backlog. Today it is a heading plus a flat `TaskRow` list, which
adds little beyond the projects list cards.

## Non-goals

- “This week” / due / scheduled strip.
- Notes, goals, or other project context beyond name, color, description,
  progress, and the board.
- Auto-assigning a column when creating a task (including from this page).
- Silent writes on page open.
- Column settings UI on the project page (gear stays on Backlog).
- Archived-projects list or archive-flow changes (archive button stays).
- A second board implementation or `projects.board` query.
- Tabs (board vs list) or keeping the flat task list.
- Free-form hex color input.

## Context

Backlog already renders `BacklogBoard` from `api.backlog.board` and moves
cards with `tasks.moveOnBoard`. Columns are account-wide. Unassigned tasks
(`columnId` missing) sit in a synthetic **Backlog** column on that query.

`projects.update` already accepts optional `name`, `description`, and
`color`. Description is click-to-edit via `ProjectDescription`. Name and
color are not editable after create. List cards count “done” with
`completedAt`; the source of truth for done is now the Done column
(`boardColumns.isDone`).

Yesterday’s create/description spec deferred this board and richer chrome
until custom columns landed.

## Approach

Reuse `BacklogBoard`. Scope `api.backlog.board` with optional `projectId`.
Replace the task list with that board. Add header identity (inline name,
color swatches, existing description) and progress (leftover / done using
the Done column). Unassigned tasks stay off this board until the user
clicks **Place on board**.

## Architecture

No new tables. Stay on `/projects/$projectId`.

| Path | Role |
| --- | --- |
| `convex/backlog.ts` (`board`) | Optional `projectId`. When set: only that project’s tasks; omit the synthetic Backlog (unassigned) column. When unset: current Backlog behavior unchanged. |
| `convex/projects.ts` | `placeOnBoard`: assign every unassigned, non-archived task in this project to the first named column by `order`. |
| `src/routes/_authenticated/projects/$projectId.tsx` | Header + banner + `BacklogBoard`; drop `TaskRow` list. Optimistic `moveOnBoard` against `backlog.board` with `{ projectId }`. |
| `src/components/tasks/BacklogBoard.tsx` | Same contract. Hide project badge when every card is this project. |
| Header UI | Inline name, color swatches, `ProjectDescription`, progress, archive, delete, add task. Small `ProjectHeader` extract is fine if the page gets noisy; not required. |
| `src/routes/_authenticated/projects/index.tsx` | Progress uses Done column, not `completedAt`. |

Column settings, rename, reorder, and remove stay on Backlog only. The
project page still **displays** whatever columns exist (including Done)
and can drag cards between them.

`ensureDefaults` when `boardColumns.list` is empty — same as Backlog.

## Board query

`api.backlog.board` args: `{ projectId: v.optional(v.id("projects")) }`.

When `projectId` is set:

1. Auth and ownership: project must exist and belong to the user, else
   `Project not found` (same as `projects.get`).
2. Collect non-archived tasks with that `projectId` only.
3. Bucket into named columns only. Tasks with no `columnId` (or a stale id
   that is not a current column) are **not** returned on any column.
4. Do not include the synthetic `{ columnId: null, isBacklog: true }`
   column.
5. `total` is the count of tasks actually on those named columns (not
   including unassigned).

When `projectId` is omitted, return today’s shape: synthetic Backlog
column plus named columns, all non-archived tasks for the user.

Callers:

- Backlog page: `convexQuery(api.backlog.board, {})` (or omit the field).
- Project page: `convexQuery(api.backlog.board, { projectId })`.

Optimistic `moveOnBoard` on the project page must read/write the query
keyed by `{ projectId }`, not `{}`.

## Place on board

Banner on the project page when unassigned count > 0:

> N tasks aren’t on the board  
> **Place on board**

Unassigned = non-archived task in this project with no `columnId`. Stale
`columnId` that does not match a current column is treated as unassigned
for the banner and for this mutation (same “not on a named column” rule).

`projects.placeOnBoard`:

- Args: `{ projectId }`. Returns `null`.
- Auth: same ownership check as `projects.get`.
- Target column: first row from `listColumnsForUser` by `order` (named
  columns only). If that column is Done, still use it — no extra rule.
- If there are no named columns, throw a clear error (`No board columns`)
  rather than silently doing nothing after `ensureDefaults` failed.
- Patch each matching task’s `columnId` to that id. Do not change other
  fields (`completedAt` stays whatever `tasks.update` / `moveOnBoard`
  already maintain elsewhere; this mutation only sets `columnId`).
- No-op success when zero matching tasks.
- Do not touch tasks on other projects.

New tasks from `AddTaskModal` on this page remain uncolumned unless the
modal already sets a column. The banner appears until Place on board (or
the user sets a column in the edit modal / Backlog).

## Header

Keep back link, archive, delete, **+ Add task**, and `ProjectDescription`.

**Name:** click-to-edit on the title, same save/cancel/error pattern as
description. Trimmed empty name is invalid; stay in edit with an error
(`Name is required`). Save → `projects.update` `{ name }`.

**Color:** the eight `BOARD_COLUMN_COLORS` swatches, same interaction as
create-project / column settings. Changing selection saves immediately via
`projects.update`. `projects.update` must reject a color that fails
`isBoardColumnColor` (`Invalid project color`) when `color` is provided.

**Progress:**

- **Done** = non-archived project task whose `columnId` is the Done column
  (`isDone`).
- **Leftover** = every other non-archived project task (including
  unassigned / stale column).
- **Bar** = `round(done / total * 100)` with `total = leftover + done`;
  `0` when `total === 0`.

Projects **list** cards use this same rule (load `boardColumns.list`, map
task `columnId` → `isDone`). Do not use `completedAt` for these counts.

## Board UI on the project page

- Render named columns via existing `BacklogBoard` (horizontal scroll,
  drag, click → `EditTaskModal`).
- Hide project badge on cards (every card is this project).
- Empty project: no banner; empty droppable columns; add task is enough.
- No gear, no column rename/remove/reorder handlers on this page
  (`onRename` / `onRemoveColumn` / `onReorderColumns` omitted).
- Drag still calls `tasks.moveOnBoard`.

## Data flow

1. `projects.get` — project + tasks for header counts and unassigned
   banner (filter archived the same way `get` already does).
2. `backlog.board` `{ projectId }` — columns and cards.
3. `boardColumns.list` + `ensureDefaults` if empty.
4. Header edits → `projects.update`.
5. Place on board → `projects.placeOnBoard`.
6. Add/edit/delete task — existing modals; add still locks `projectId`.

Failed mutations stay on the page. Place/update errors do not half-apply
beyond normal Convex mutation behavior. Show a short error on the banner
if place fails (`Could not place tasks on the board.`).

## Testing

- `backlog.board` with `projectId`: only that project; no synthetic
  Backlog column; unassigned omitted from columns; other projects absent;
  foreign `projectId` → `Project not found`.
- `backlog.board` without `projectId`: existing Backlog column + all
  tasks (regression).
- `placeOnBoard`: first named column by order; only this project’s
  unassigned/stale-column tasks; other projects untouched; no-op when
  none; error when no named columns.
- Progress helpers or list/detail counting: Done column, not
  `completedAt`; unassigned is leftover.
- Frontend: banner visibility vs count; name empty rejection; color save;
  board still moves cards (extend existing board tests rather than new
  dnd coverage unless none exist).

No new Playwright spec unless a smoke test asserts the old task list.

## File-level notes

- Prettier: Convex files keep double quotes + semicolons; `src/` uses
  single quotes, no semicolons.
- Public Convex functions keep `args` and `returns` validators.
- Do not fork `BacklogBoard`. Optional `showProjectBadge` (default true)
  is enough.
- Shared progress counting should live in one helper (e.g.
  `src/lib/project-progress.ts`) used by list and detail so the two
  pages cannot drift.
