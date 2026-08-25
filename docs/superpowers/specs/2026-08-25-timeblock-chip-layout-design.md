# Time block chip layout + delete in modal — Design

**Date:** 2026-08-25
**Status:** Draft (awaiting review)
**Touches:** `src/components/calendar/TimeBlockChip.tsx`, `src/lib/timeBlockAppearance.ts`, `src/components/time-block/AddTimeBlockModal.tsx`, `src/components/calendar/DayRail.tsx`, `src/components/calendar/WeekView.tsx`, `src/routes/_authenticated/today.tsx`, `src/routes/_authenticated/calendar.tsx`

Related: [DayRail scroll + add/edit time block](./2026-08-24-dayrail-scroll-and-block-modal-design.md) (chip tap opens edit modal).

## 1. Goal

Short time blocks currently clip the **Review** control because title and actions share a stacked layout under `overflow-hidden`. Delete is hover-only, which fails on touch. Fix the chip so Review stays visible, and move delete into the edit modal.

## 2. Decisions (locked)

| Topic | Decision |
| --- | --- |
| Chip controls | **Review** in footer when needed. Google badge stays in the **header** (not a footer trigger). No delete on the chip. |
| Layout | Flex column: **header** (title) → **body** (task/description) → optional **sticky footer**. |
| Footer | Mount **only** when Review is present (`needsReview` + `onReviewBlock`). Google alone does not mount a footer. No empty footer strip. |
| Review visibility | Always visible when needed (not hover-gated). Footer is pinned to the bottom of the chip so short blocks keep Review. |
| Body | Linked task title when present; only shown when height allows (keep a min-height gate like today’s `SUBTITLE_MIN_HEIGHT`). Truncates. |
| Outcome label | Done / Partial / Missed stays in the header row when height allows — not in the footer. |
| Delete | Only in **Edit time block** modal. Same inline confirm pattern as Edit task (ghost Delete → “Delete this time block?” / Delete / Keep). |
| ConfirmDialog | Remove page-level `blockToDelete` + ConfirmDialog for time blocks on Today and Calendar once the modal owns delete. |
| Drag / edit | Unchanged: body drag/resize; tap chip opens edit; Review `stopPropagation`. |

## 3. Architecture

```
TodayPage / CalendarPage
  DayRail | WeekView
    TimeBlockChip
      header  → title (+ Google badge if google) (+ outcome when tall enough)
      body    → task title (optional, height-gated)
      footer  → Review  (only when needs review)
      tap     → onEditBlock(block)
      Review  → onReviewBlock(block)
  AddTimeBlockModal (edit)
    Save | Cancel | Delete (inline confirm) → timeBlocks.remove
```

Chip no longer takes `onRemoveBlock`. DayRail / WeekView drop that prop. Pages stop wiring chip delete and the separate delete ConfirmDialog for blocks.

`isBlockControl` drops `[data-delete-button="true"]` (control gone). Review stays excluded from drag start.

## 4. Chip layout

Outer chip: full displayed height, `overflow-hidden` kept so content does not spill into neighboring hours.

**Pinning rule:** when a footer is present, it must remain fully visible. Prefer absolute bottom footer (or equivalent: footer `shrink-0` + header/body in a `min-h-0` region above). Header/body clip or hide first — never the footer.

| Slot | Content | Rules |
| --- | --- | --- |
| Header | `block.title` | Always; one line; truncate. Google badge when `origin === 'google'`. Optional outcome label on the right when `displayedHeight >= SUBTITLE_MIN_HEIGHT`. |
| Body | `taskTitle` | Only if present and height ≥ `SUBTITLE_MIN_HEIGHT`; fills space between header and footer; truncate. |
| Footer | Review button | Rendered only when `needsReview` and `onReviewBlock`. Pinned to the chip bottom. Always opaque (no hover opacity gate). |

Resize handle stays absolute bottom-right. Footer content aligns start / left so it does not cover the handle.

When the footer is present on a short chip, body (and possibly outcome) hide first; title truncates; Review remains.

No new Convex fields. Tone / border classes unchanged (`blockToneClass`, `reviewBorderClass`).

## 5. Edit modal delete

In `AddTimeBlockModal`, when `block` is set (edit mode only):

- Footer mirrors Edit task: left side Delete / confirm; right side Cancel + Save.
- First click: show “Delete this time block?” with **Delete** and **Keep**.
- Confirm: call `timeBlocks.remove` with `blockId`, then `onClose`.
- Add mode: no Delete control.
- Error: “Could not delete the time block. Please try again.” (same tone as update failure).

Pages pass nothing extra for delete beyond the existing `block` prop; the modal owns the mutation.

## 6. Error handling and edge cases

- Google blocks: no Review footer (review rules already exclude them); Google badge in header; edit modal still opens; Delete is available (existing remove rules apply).
- Very short blocks with Review: footer wins over body; title may be heavily truncated — acceptable.
- Closing the modal while confirming delete resets confirm state (same as Edit task).
- Chip hover styles that only existed for delete go away with the button.

## 7. Testing

No React Testing Library / jsdom requirement.

Vitest (pure), if helpers change:

- `isBlockControl` no longer matches delete (and still matches Review).

Manual — Today and Calendar:

1. Short past task-linked block: Review visible in the footer without hover.
2. Tall block: title header, task body, Review footer when needed.
3. No-review app block: no footer; title (+ body when tall).
4. Google block: Google badge in header; no Review footer.
5. Tap chip → Edit → Delete → confirm removes block; Keep cancels confirm.
6. Add flow: no Delete in modal.
7. Drag / resize / empty-click add unchanged.

## 8. Out of scope

- New chip colors, typography system, or calendar geometry hour height
- Height-tiered alternate layouts (title+Review single row)
- Always-on empty footer
- Moving Review into the modal
- Keyboard-only delete
- Changing review business rules (`blockNeedsReview`)
