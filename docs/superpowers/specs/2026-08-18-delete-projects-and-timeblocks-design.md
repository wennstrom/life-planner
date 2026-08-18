# Delete Projects and Time Blocks — Design

**Date:** 2026-08-18
**Status:** Approved (pending implementation)

## 1. Goal

Let the user delete a project from its detail page, choosing whether to keep or destroy its tasks, and delete a time block from the calendar. Both flows confirm first. Destroying tasks (or a block) also cancels linked Google Calendar events.

## 2. Context

`projects.remove` already deletes the project and unlinks its tasks (`projectId` cleared). The project detail page only exposes **Archive**. `timeBlocks.remove` already marks the block pending and schedules `google.outbound.deleteBlock`, which cancels the Google event (when one exists) then `deleteInternal`. No calendar surface calls it.

Task delete (`ConfirmDialog` on Backlog, inline confirm in `EditTaskModal`) is the pattern to follow. Notes stay out of this change.

## 3. Backend

### 3.1 `projects.remove`

Gains a required `deleteTasks: v.boolean()`.

- Ownership check unchanged: missing or other-user project throws `"Project not found"`.
- **`deleteTasks: false`:** patch every task on `by_project` so `projectId` is cleared, then delete the project. Time blocks stay on those tasks. Notes are not touched.
- **`deleteTasks: true`:** for each of those tasks, schedule delete of every block on `by_task` through the same path as `timeBlocks.remove` (pending + `outbound.deleteBlock`). Then delete the tasks, then the project.
- Empty project: either flag is fine; there are no tasks to walk.

Extract the “patch pending + schedule `outbound.deleteBlock`” step into a helper used by both `timeBlocks.remove` and this cascade so the Google-cancel path cannot drift.

Standalone `tasks.remove` is unchanged: it still deletes only the task.

### 3.2 `timeBlocks.remove`

Unchanged behavior. Public mutation used by the calendar. Works for `origin === "app"` and `origin === "google"`. Wrong user throws `"Time block not found"`.

Local row removal still happens in `deleteInternal` after the scheduled action, not inside the public mutation. Google failures are logged in the action; the dialog does not wait on Google.

## 4. UI

### 4.1 Project detail

Archive stays. A **Delete** button sits next to it and opens `ProjectDeleteDialog`.

**No tasks:** “Delete *Name*? This cannot be undone.” Keep / Delete. Confirm calls `projects.remove` with `deleteTasks: false`.

**Has tasks:** Delete stays disabled until one option is chosen (no default):

- Keep tasks in the backlog
- Delete *N* tasks — also deletes their time blocks and cancels linked Google Calendar events

Confirm calls `projects.remove` with `deleteTasks` matching the choice.

On success, navigate back to the projects list the same way Archive already does (`history.back()`). On mutation failure, the dialog stays open and shows a short error, same as task `ConfirmDialog`.

Notes are not mentioned.

### 4.2 Calendar

Today’s `DayRail` and the Calendar `WeekView` each gain an `onRemoveBlock` callback and a hover/focus trash control on every block, matching `TaskRow` (`opacity-0` until `group-hover` / `group-focus-within`). The control `stopPropagation`s so it does not start a drag.

Today and Calendar pages hold `blockToDelete` state and the existing `ConfirmDialog`:

> *Block title* will be permanently deleted. The Google Calendar event will also be canceled.

Confirm label **Delete**, cancel **Keep**, `confirmVariant="destructive"`. Confirm calls `timeBlocks.remove`. App-created and Google-sourced blocks both get the control.

History tab and review modal do not gain delete.

## 5. Files

**Convex**

- Modify: `convex/projects.ts`, `convex/timeBlocks.ts`
- Tests: add `convex/projects.test.ts`; extend `convex/timeBlocks.test.ts` for `remove`

**Frontend**

- Add: `src/components/projects/ProjectDeleteDialog.tsx`
- Modify: `src/routes/_authenticated/projects/$projectId.tsx`, `src/components/calendar/DayRail.tsx`, `src/components/calendar/WeekView.tsx`, `src/routes/_authenticated/today.tsx`, `src/routes/_authenticated/calendar.tsx`

## 6. Testing

Convex function tests (`npm test`):

- `deleteTasks: false` — project gone; tasks remain with `projectId` unset
- `deleteTasks: true` — project, its tasks, and those tasks’ blocks are gone after scheduled deletes finish; `outbound.deleteBlock` was scheduled per block
- empty project deletes
- another user’s project is rejected
- `timeBlocks.remove` — owner can delete (schedules Google delete); wrong user is rejected

Manual: unlink vs delete-tasks from project detail (copy includes the Google warning); hover-delete a block on Today and on Calendar, including a Google-sourced meeting.

## 7. Non-goals

- Notes attached to the project
- Delete from the projects list
- Delete from task History or the review modal
- Cascading blocks when deleting a task from Backlog / EditTaskModal
- Replacing Archive
