# T04 — Backend schema migration & cleanup

**Labels**: `wayfinder:task`
**Blocked by**: T02

## Question

N/A — task ticket. Blocked until T02 resolves `completedAt` behaviour.

## Work

Follows the widen→migrate→narrow pattern.

### Widen
Add the four new literals to `taskStatus` in `schema.ts`:
```
v.union(
  v.literal("backlog"),
  v.literal("today"),   // keep during widen
  v.literal("in-progress"),
  v.literal("review"),
  v.literal("test"),
  v.literal("investigate"),
  v.literal("done"),
)
```
Deploy widened schema.

### Migrate
Run (or extend) the existing `migrateLegacyTasks` mutation to also convert any remaining `"today"` tasks to `"backlog"`.

### Narrow
Remove `v.literal("today")` from the union.

### Other backend changes
- Update the `taskStatus` validator in `tasks.ts` (line 68) — currently only `backlog | done`; expand to all six.
- Update `timeBlocks.ts` line 185 — the block review mutation that force-sets `status: "done"` and `completedAt`; remove this auto-done behaviour.
- Update `tasks.test.ts` and `timeBlocks.test.ts` to cover the new statuses and the removed auto-done.
