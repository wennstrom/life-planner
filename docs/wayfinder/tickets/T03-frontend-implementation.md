# T03 — Frontend implementation

**Labels**: `wayfinder:task`
**Blocked by**: T01

## Question

N/A — this is a task ticket. Blocked until T01 resolves the Status column UX decision.

## Work

1. Update `EditTaskModal` status `<Select>` to include all six statuses: `backlog`, `in-progress`, `review`, `test`, `investigate`, `done`.
2. Add a Status column to `BacklogTasksTable` (display-only badge or inline dropdown per T01 decision).
3. Remove the "mark task done" checkbox from the time block review UI (identify the component first).
4. Update `isTaskActive` in `taskStats.ts` — currently returns true for `status !== "done"`. Decide if `done` is still the only "inactive" status, or if all non-done statuses are "active".
5. Update `backlog.tsx` toggle action — currently toggles between `done` / `backlog`; remove or repurpose if the table no longer has a checkbox toggle.
