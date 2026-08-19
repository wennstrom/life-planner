# Wayfinder Map: Task Status Expansion

**Labels**: `wayfinder:map`

## Destination

A deployed, migrated app where tasks can carry one of six statuses — `backlog`, `in-progress`, `review`, `test`, `investigate`, `done` — with `done` archiving tasks out of the backlog view; the deprecated `today` literal removed from schema and code; the time block review "mark task done" checkbox removed; and a Status column visible in the backlog table.

## Notes

- Domain: Convex backend + React/TanStack frontend.
- Schema uses widen→migrate→narrow pattern for safe live migrations.
- The backlog filter logic (`!== "done"`) stays unchanged — all non-done statuses show in backlog.
- `today` was a leftover from a prior migration and must be cleaned up here.
- Skills: `convex-migration-helper`, `convex-expert` if needed.

## Decisions so far

- [T01 — Status column UX](tickets/T01-status-column-ux.md) — Inline-editable dropdown in the backlog table (click cell to change status without opening the modal).
- [T02 — completedAt on status change](tickets/T02-completed-at-on-status-change.md) — Clear `completedAt` when a task moves away from `done`; existing behaviour preserved.
- [T03 — Frontend implementation](tickets/T03-frontend-implementation.md) — Status column added as inline dropdown; EditTaskModal expanded to all 6 statuses; `toggle` action replaced by `setStatus`; "Task is finished" checkbox removed from ReviewBlockModal.
- [T04 — Backend migration](tickets/T04-backend-migration.md) — Schema widened then narrowed (today removed); taskStatus validator in tasks.ts expanded; auto-done removed from timeBlocks review mutation.

## Not yet specified

<!-- nothing remaining — frontier is clear to T03 and T04 -->

## Out of scope

- A dedicated "Active" / "In-progress" view separate from the backlog.
- Any changes to the backlog filter predicate.
- Changing the time block review flow beyond removing the "mark task done" checkbox.
