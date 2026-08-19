# T01 — Status column UX: inline-editable or display-only?

**Labels**: `wayfinder:grilling`
**Blocks**: T03 (frontend implementation)

## Question

The backlog table will show a Status column. Should the cell be:

(A) **Display-only** — shows a badge/label for the current status; editing requires opening the Edit Task modal (consistent with how Priority and Due Date work today).

(B) **Inline-editable dropdown** — clicking the cell opens a select in-place, letting the user change status without opening the modal (faster for workflow triage).

Relevant context: Priority and Due Date are currently read-only in the table; editing them requires the modal. Status is a more frequently-changed field (workflow progression), so inline editing may be more ergonomic.
