# DayRail scroll + add/edit time block — Design

**Date:** 2026-08-24
**Status:** Draft (awaiting review)
**Touches:** `src/lib/calendarGeometry.ts`, `src/components/calendar/DayRail.tsx`, `src/components/calendar/WeekView.tsx`, `src/components/calendar/TimeBlockChip.tsx`, `src/components/calendar/useBlockPointerDrag.ts`, `src/components/time-block/AddTimeBlockModal.tsx`, `src/routes/_authenticated/today.tsx`, `src/routes/_authenticated/calendar.tsx`

## 1. Goal

Today and Calendar are the same time-block surface: Today is one day, Calendar is that day expanded to a week. Both show a **full day** (midnight to midnight), **scroll** the hour grid, **click empty time** to add with date and start prefilled, and use a **pencil** on a chip to **edit** in the **same modal**.

## 2. Decisions (locked)

| Topic | Decision |
| --- | --- |
| Hours | **00:00-23:59** on DayRail **and** WeekView. Shared geometry constants, not two ranges. |
| Scroll | The **hour grid** scrolls inside a max-height viewport. Page chrome (Today intention/stats; week day-name header and unscheduled sidebar) stays outside that scroller. |
| Empty click | Click on the grid (not a chip) opens add. Date = **that column’s day**. Start = click Y snapped to **15 minutes**. Duration **60 minutes**. |
| Occupied | Chip body still **drag/resize**. **Edit icon** (next to delete) opens the modal. Shown on both pages. |
| Modal | One component. No block → **Add time block** + `create`. Block present → **Edit time block** + `update`. |
| Calendar vs Today | Same interactions. Week only adds seven columns, weekday header, week nav, and unscheduled sidebar. |

## 3. Architecture

Keep Convex as-is (`timeBlocks.create` / `timeBlocks.update`). Geometry stays pure. Each **page** owns modal open state (today already does; calendar’s `+ New block` already does).

```
TodayPage / CalendarPage
  DayRail | WeekView
    empty click  -->  { dateKey, startMs }
    edit icon    -->  { block }
  AddTimeBlockModal  create | update
```

Shared day range:

- `CALENDAR_START_HOUR = 0`
- `CALENDAR_END_HOUR = 24` (hours rendered are `[0, 24)`)
- Remove DayRail’s `DAY_RAIL_END_HOUR = 18` and WeekView’s `WEEK_END_HOUR = 19`

Because both views use midnight as top, `msToTop` / `topToMs` keep a single `CALENDAR_START_HOUR`. No per-view `startHour` parameter.

`useBlockPointerDrag` does not need a new hour offset once start hour is 0 everywhere. It **does** still need correct `dayStartMs` per column (already true).

## 4. Geometry

Update existing tests that assume start hour 7: midnight maps to top 0; a 9:00 block’s top is `9 * HOUR_HEIGHT`.

`dropRangeFromPointer` takes `scrollTop` (default 0):

`top = max(0, clientY - railTop + scrollTop)`

Required once the grid scrolls.

Add `snapMs(ms, stepMs)` (15 minutes) for empty-click starts. Clamp so a 60-minute default does not pass `dayStart + 24h`. Latest start: **23:00**.

## 5. Scroll UI (both views)

- Inner hour grid: `overflow-y-auto`, max height `min(70vh, 12 * HOUR_HEIGHT)`, content height `24 * HOUR_HEIGHT`.
- DayRail: optional task palette stays **above** the scroller.
- WeekView:
  - Weekday header row stays **outside** the scroller (does not scroll away).
  - Hour labels **and** the seven day columns share **one** vertical scroller so columns stay aligned.
  - Unscheduled sidebar stays outside the scroller.
- No auto-scroll-to-now.

## 6. Empty slot click

Handler on the scrolling day column / rail:

1. Ignore if the target is inside a chip.
2. `dropRangeFromPointer` with that column’s `getBoundingClientRect().top`, the scroller’s `scrollTop`, and that day’s `dayStartMs`.
3. Snap start to 15 minutes; clamp as in §4.
4. `onEmptySlotClick({ startMs, dateKey })`.

Task drop onto a column uses the same `scrollTop` math; still `onCreateFromTask`.

**Today:** `dateKey` is always today. Extend `addBlockOpen` into a draft `{ start?: number, dateKey?: string, block?: Doc<'timeBlocks'> | null }`.

**Calendar:** empty click sets `dateKey` for **that weekday**, not “today”. `+ New block` still opens add with no start (current defaults). Closing the modal clears the draft so the next open is clean.

## 7. Edit icon

On `TimeBlockChip` (both views):

- Pencil (`lucide-react`), same size/hover as delete
- `data-edit-button="true"`
- `aria-label="Edit time block"`
- `stopPropagation`
- `onEditBlock(block)` required for Today and Calendar; both pages pass it

`isBlockControl` includes `[data-edit-button="true"]` so drag does not start from the pencil.

## 8. Shared modal

Keep `AddTimeBlockModal.tsx` and the export name. Dialog title and submit label change in edit mode.

```ts
type AddTimeBlockModalProps = {
  open: boolean
  onClose: () => void
  block?: Doc<'timeBlocks'> | null
  defaultTaskId?: Id<'tasks'>
  defaultIntent?: string
  defaultStart?: number
  defaultDateKey?: string
}
```

When `block` is set:

- Title: **Edit time block**
- Prefill task, intent (`block.title`), date from `block.start`, start time, duration from `end - start`
- Submit: `timeBlocks.update` (`blockId`, `title`, `start`, `end`, `taskId` — `null` if cleared)
- Button: **Save**

Otherwise: **Add time block** / **Add block** / `create`, as today.

Google-sourced blocks: same modal and existing `update` sync rules.

Error: create unchanged; edit: “Could not update the time block. Please try again.”

Backlog’s add-only usage stays add-only (`block` omitted).

## 9. Error handling and edge cases

- Clicks on a chip never hit the empty handler.
- Drag/resize does not open the modal.
- One modal instance per page; a new click/edit replaces the draft.
- Edit duration: minutes, step 15 on the input.
- No Convex schema change.

## 10. Testing

No React Testing Library / jsdom.

Vitest (pure):

- Midnight → top 0; 9:00 → `9 * HOUR_HEIGHT`.
- `dropRangeFromPointer` includes `scrollTop`.
- `snapMs` 15-minute examples.
- `isBlockControl` includes edit **if** DOM tests run in this Vitest environment.

Manual — Today **and** Calendar:

1. Scroll 00:00 through 23:00. Week: header stays put; all seven days and hour labels move together.
2. Empty click ~14:07 → add, correct **date** (today vs that weekday), start ~14:00 or 14:15, duration 60.
3. Pencil → Edit time block, Save persists.
4. Drag/resize, Review, Delete still work.
5. Task drop onto a **scrolled** column lands on the visible hour.

## 11. Out of scope

- Auto-scroll to current time
- Keyboard create/edit
- React Compiler / RTL
- New Convex functions
- Changing backlog beyond still compiling against the modal props
