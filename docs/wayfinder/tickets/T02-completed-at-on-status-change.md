# T02 — completedAt behaviour when transitioning away from "done"

**Labels**: `wayfinder:grilling`
**Blocks**: T04 (backend implementation)

## Question

The `tasks` table has a `completedAt` timestamp that is set when `status` is moved to `"done"` and currently cleared (`undefined`) when status changes away from done.

With the new statuses, if a user moves a task from `done` back to e.g. `in-progress`, should `completedAt` be:

(A) **Cleared** (set to `undefined`) — the task is no longer complete, history is reset. Keeps semantics clean.

(B) **Preserved** — `completedAt` records when it was last completed; useful if you ever want a "re-opened" history. The field just stops being the authoritative "is done" signal.

Current code already clears it on any non-done status update (line 104 in `tasks.ts`). Option A maintains that behaviour.
