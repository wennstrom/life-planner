# Clickable Task Row Design

**Date:** 2026-08-13  
**Status:** Approved (pending implementation)

## Goal

Make the entire task row open the existing edit/detail modal on click, with clear hover affordance that the row is interactive.

## Context

`TaskRow` is shared by Today, Backlog, and Project detail pages. Today only the title is a button that calls `onOpenDetails`. The status select already uses `stopPropagation`. The delete control already fades in via `group-hover`.

## Behavior

- When `onOpenDetails` is provided:
  - Clicking anywhere on the row (except nested interactive controls) opens the edit modal.
  - Pointer cursor on the row.
  - Subtle hover background highlight (`hover:bg-accent/40` or equivalent muted accent).
  - Keyboard: Enter/Space on the focused row also opens details (row is focusable with `tabIndex={0}` and `role="button"`).
- Title is plain text (no separate link / underline hover).
- Status select and delete button stop propagation so they do not open the modal.
- Delete remains opacity-0 until `group-hover` (and should also show on focus-within for keyboard users).
- When `onOpenDetails` is omitted, row stays non-clickable (no pointer/hover highlight for open-details).

## Non-goals

- No changes to `EditTaskModal`, parent page wiring, or Convex APIs.
- No new props beyond existing `onOpenDetails`.
- No drag-and-drop or multi-select.

## Implementation approach

Interactive `<li>` with click + keyboard handlers when `onOpenDetails` is set. Nested controls keep `stopPropagation`. Prefer this over overlay links or wrapping the row in a `<button>` (invalid with nested buttons/select).

## Files

- Modify: `src/components/tasks/TaskRow.tsx` only.

## Testing

- Manual: click row → modal opens; change status → no modal; delete → no modal; hover shows highlight + delete; keyboard focus + Enter/Space opens modal.
- No new automated tests required for this presentational change unless the project already has TaskRow unit tests (it does not today).
