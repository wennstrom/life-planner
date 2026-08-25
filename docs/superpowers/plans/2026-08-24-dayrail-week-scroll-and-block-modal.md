# DayRail + WeekView scroll and block modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today and Calendar share one full-day (00:00–24:00) scrolling grid; empty clicks open add with date and time filled; a pencil opens the same modal in edit mode.

**Architecture:** Keep Convex `timeBlocks.create` / `timeBlocks.update`. Put day-range, scroll-aware pointer math, snap, and end-of-day clamp in `calendarGeometry`. DayRail and WeekView are layout shells that call `onEmptySlotClick` / `onEditBlock`. Each page owns one `AddTimeBlockModal` draft. Week is Today expanded to seven columns (sticky weekday header, one shared vertical scroller).

**Tech Stack:** React 19, TypeScript, Vitest (pure unit tests only), existing Convex mutations, lucide-react `Pencil`.

**Spec:** `docs/superpowers/specs/2026-08-24-dayrail-scroll-and-block-modal-design.md`

## Global Constraints

- Do not enable the React Compiler or add `use()`, `useOptimistic`, or `useActionState`.
- Do not add React Testing Library / jsdom. Test pure functions in Vitest; verify UI by hand.
- Do not change Convex schema or add Convex functions.
- Do not auto-scroll to now. Do not add keyboard create/edit.
- `HOUR_HEIGHT` stays `54`. Visible scroller height is `min(70vh, 12 * HOUR_HEIGHT)`.
- Empty-click start snaps to **15 minutes**. Default duration is **60 minutes**. Latest start is **23:00**.
- Modal titles: **Add time block** / **Edit time block**. Buttons: **Add block** / **Save**.
- Edit failure copy: `Could not update the time block. Please try again.`
- Pointer math: pass the **scroller** `getBoundingClientRect().top` and `scrollTop`. Do not add `scrollTop` to a tall column’s own `getBoundingClientRect().top` (that double-counts).
- Import DOM event types from `'react'`.
- Commit only when the user asked to commit. If they have not, skip every Commit step.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/calendarGeometry.ts` | `CALENDAR_START_HOUR = 0`, `CALENDAR_END_HOUR = 24`, `CALENDAR_VISIBLE_HOURS = 12`, `SLOT_SNAP_MS`, `scrollTop` on drop, `snapMs`, `clampBlockStart`, `emptySlotStartFromPointer` |
| `src/lib/calendarGeometry.test.ts` | Geometry tests |
| `src/lib/timeBlockAppearance.ts` | `isBlockControl` includes edit; `isTimeBlockChipTarget` |
| `src/components/calendar/TimeBlockChip.tsx` | Pencil; `data-time-block-chip`; `onEditBlock` |
| `src/components/time-block/AddTimeBlockModal.tsx` | Create vs update from optional `block` |
| `src/components/calendar/DayRail.tsx` | Full-day scroll + empty click + edit |
| `src/components/calendar/WeekView.tsx` | Same grid/scroll/click/edit; sticky weekday header |
| `src/routes/_authenticated/today.tsx` | Modal draft state |
| `src/routes/_authenticated/calendar.tsx` | Modal draft state |

Out of scope: backlog behavior beyond still compiling; new Convex functions.

---

### Task 1: Midnight geometry, scrollTop, snap, clamp

**Files:**
- Modify: `src/lib/calendarGeometry.ts`
- Modify: `src/lib/calendarGeometry.test.ts`

**Interfaces:**
- Consumes: existing `HOUR_HEIGHT`, `MS_PER_HOUR`, `DEFAULT_BLOCK_DURATION_MS`, `topToMs`
- Produces: `CALENDAR_START_HOUR` (`0`), `CALENDAR_END_HOUR` (`24`), `CALENDAR_VISIBLE_HOURS` (`12`), `SLOT_SNAP_MS`, `snapMs`, `clampBlockStart`, `emptySlotStartFromPointer`; `dropRangeFromPointer` accepts `scrollTop?: number`

- [ ] **Step 1: Write the failing tests**

In `src/lib/calendarGeometry.test.ts`, add these to the existing import list: `CALENDAR_END_HOUR`, `SLOT_SNAP_MS`, `clampBlockStart`, `emptySlotStartFromPointer`, `snapMs`.

Add a `describe('day range')` at the top of the describes:

```ts
describe('day range', () => {
  it('starts at midnight and renders 24 hours', () => {
    expect(CALENDAR_START_HOUR).toBe(0)
    expect(CALENDAR_END_HOUR).toBe(24)
  })
})
```

Keep the existing `blockLayout` 1-hour assertion as-is (it uses `CALENDAR_START_HOUR` and will stay correct when that constant becomes 0).

Add after the existing `dropRangeFromPointer` describe:

```ts
describe('dropRangeFromPointer scrollTop', () => {
  it('treats scroller top + scrollTop as content offset', () => {
    const { start } = dropRangeFromPointer({
      clientY: 100 + HOUR_HEIGHT,
      railTop: 100,
      scrollTop: HOUR_HEIGHT,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + (CALENDAR_START_HOUR + 2) * MS_PER_HOUR)
  })
})

describe('snapMs', () => {
  it('rounds to the nearest step', () => {
    expect(snapMs(7 * 60_000, SLOT_SNAP_MS)).toBe(0)
    expect(snapMs(8 * 60_000, SLOT_SNAP_MS)).toBe(SLOT_SNAP_MS)
  })
})

describe('clampBlockStart', () => {
  it('clamps to 23:00 so a 60-minute block stays on the day', () => {
    const late = dayStart + 23.5 * MS_PER_HOUR
    expect(clampBlockStart(late, dayStart)).toBe(dayStart + 23 * MS_PER_HOUR)
  })

  it('does not go before midnight', () => {
    expect(clampBlockStart(dayStart - MS_PER_HOUR, dayStart)).toBe(dayStart)
  })
})

describe('emptySlotStartFromPointer', () => {
  it('snaps a 14:07 click to 14:00', () => {
    const fourteen = 14 * MS_PER_HOUR
    const sevenMinPx = (7 / 60) * HOUR_HEIGHT
    const start = emptySlotStartFromPointer({
      clientY: 100 + (fourteen / MS_PER_HOUR) * HOUR_HEIGHT + sevenMinPx,
      railTop: 100,
      scrollTop: 0,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + fourteen)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/calendarGeometry.test.ts`

Expected: FAIL — `snapMs` / `emptySlotStartFromPointer` / `CALENDAR_END_HOUR` not exported, `CALENDAR_START_HOUR` still `7`, and/or `scrollTop` ignored.

- [ ] **Step 3: Implement geometry**

In `src/lib/calendarGeometry.ts`, change and add constants at the top:

```ts
export const CALENDAR_START_HOUR = 0
export const CALENDAR_END_HOUR = 24
export const CALENDAR_VISIBLE_HOURS = 12
export const SLOT_SNAP_MS = 15 * 60 * 1000
```

Add:

```ts
export function snapMs(ms: number, stepMs: number): number {
  return Math.round(ms / stepMs) * stepMs
}

export function clampBlockStart(startMs: number, dayStartMs: number): number {
  const latest = dayStartMs + (CALENDAR_END_HOUR - 1) * MS_PER_HOUR
  return Math.min(Math.max(startMs, dayStartMs), latest)
}

export function emptySlotStartFromPointer(args: {
  clientY: number
  railTop: number
  scrollTop: number
  dayStartMs: number
}): number {
  const { start } = dropRangeFromPointer({
    clientY: args.clientY,
    railTop: args.railTop,
    scrollTop: args.scrollTop,
    dayStartMs: args.dayStartMs,
  })
  const offset = start - args.dayStartMs
  const snapped = args.dayStartMs + snapMs(offset, SLOT_SNAP_MS)
  return clampBlockStart(snapped, args.dayStartMs)
}
```

Replace `dropRangeFromPointer` with:

```ts
export function dropRangeFromPointer(args: {
  clientY: number
  railTop: number
  dayStartMs: number
  scrollTop?: number
}): { start: number; end: number } {
  const top = Math.max(
    0,
    args.clientY - args.railTop + (args.scrollTop ?? 0),
  )
  const start = clampBlockStart(topToMs(top, args.dayStartMs), args.dayStartMs)
  return { start, end: start + DEFAULT_BLOCK_DURATION_MS }
}
```

Leave `msToTop` / `topToMs` using `CALENDAR_START_HOUR` (now 0). Do not add a per-view `startHour` parameter.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/calendarGeometry.test.ts`

Expected: PASS. Existing tests that use `CALENDAR_START_HOUR` keep working with start hour 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendarGeometry.ts src/lib/calendarGeometry.test.ts
git commit -m "feat: full-day calendar geometry with snap and scroll offset"
```

---

### Task 2: Chip edit control (no drag)

**Files:**
- Modify: `src/lib/timeBlockAppearance.ts`
- Modify: `src/components/calendar/TimeBlockChip.tsx`

**Interfaces:**
- Consumes: Task 1 unchanged
- Produces: `isBlockControl` matches `[data-edit-button="true"]`; `isTimeBlockChipTarget`; `TimeBlockChip` `onEditBlock`; root `data-time-block-chip="true"`

- [ ] **Step 1: Extend `isBlockControl` and add chip hit-test**

In `src/lib/timeBlockAppearance.ts` replace `isBlockControl` and add:

```ts
export function isBlockControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        '[data-review-button="true"], [data-delete-button="true"], [data-edit-button="true"]',
      ),
    )
  )
}

export function isTimeBlockChipTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('[data-time-block-chip="true"]'))
  )
}
```

Do not add jsdom tests. `useBlockPointerDrag` already calls `isBlockControl`; the new selector is enough so the pencil does not start a move.

- [ ] **Step 2: Add the pencil on `TimeBlockChip`**

In `src/components/calendar/TimeBlockChip.tsx`:

- Import `Pencil` next to `Trash2` from `lucide-react`.
- Add `onEditBlock: (block: Doc<'timeBlocks'>) => void` to props (required).
- Continue immediately into Tasks 4–5 so callers compile. Do not stop overnight with `tsc` red.

On the chip root `div`, add `data-time-block-chip="true"`.

In the control row, **before** the delete button:

```tsx
        <button
          type="button"
          data-edit-button="true"
          aria-label="Edit time block"
          className="ml-auto rounded bg-black/25 p-0.5 opacity-0 transition-opacity hover:bg-black/40 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onEditBlock(block)
          }}
        >
          <Pencil className="size-3" />
        </button>
```

Remove `ml-auto` from the delete button so edit sits at the right edge and delete follows it.

Destructure `onEditBlock` in the component args.

- [ ] **Step 3: Run existing appearance tests**

Run: `npx vitest run src/lib/timeBlockAppearance.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/timeBlockAppearance.ts src/components/calendar/TimeBlockChip.tsx
git commit -m "feat: add time-block edit pencil that does not start a drag"
```

---

### Task 3: AddTimeBlockModal edit mode

**Files:**
- Modify: `src/components/time-block/AddTimeBlockModal.tsx`

**Interfaces:**
- Consumes: `api.timeBlocks.update` (already exists)
- Produces: optional `block?: Doc<'timeBlocks'> | null`; title/button/submit branch

- [ ] **Step 1: Extend props and reset effect**

Replace `import type { Id } from '../../../convex/_generated/dataModel'` with:

```ts
import type { Doc, Id } from '../../../convex/_generated/dataModel'
```

Add to props:

```ts
  block?: Doc<'timeBlocks'> | null
```

Add `block` to the destructured props. Inside the component:

```ts
  const updateBlock = useMutation(api.timeBlocks.update)
  const editing = block != null
```

Replace the `useEffect` that runs when `open` with:

```ts
  useEffect(() => {
    if (!open) return
    if (block) {
      setTaskId(block.taskId ?? '')
      setIntent(block.title)
      const key = formatDateKey(new Date(block.start))
      setDateKey(key)
      setStartTime(timeFromMs(block.start, key))
      setDurationMinutes(
        Math.max(15, Math.round((block.end - block.start) / 60000)),
      )
    } else {
      setTaskId(defaultTaskId ?? '')
      setIntent(defaultIntent ?? '')
      setDateKey(defaultDateKey ?? formatDateKey())
      setStartTime(
        defaultStart != null
          ? timeFromMs(defaultStart, defaultDateKey ?? formatDateKey())
          : '09:00',
      )
      setDurationMinutes(60)
    }
    setNewTaskTitle('')
    setCreatingTask(false)
    setError(null)
    setPending(false)
  }, [open, block, defaultTaskId, defaultIntent, defaultStart, defaultDateKey])
```

- [ ] **Step 2: Submit create vs update**

In `handleSubmit`, after computing `start` / `end` / `linkedTaskId`, replace the single `createBlock` call with:

```ts
      if (editing) {
        await updateBlock({
          blockId: block._id,
          title: trimmedIntent,
          start,
          end,
          taskId: linkedTaskId ?? null,
        })
      } else {
        await createBlock({
          title: trimmedIntent,
          start,
          end,
          taskId: linkedTaskId,
        })
      }
      onClose()
```

In `catch`:

```ts
      setError(
        editing
          ? 'Could not update the time block. Please try again.'
          : 'Could not create the time block. Please try again.',
      )
```

- [ ] **Step 3: Title and button copy**

```tsx
          <DialogTitle>{editing ? 'Edit time block' : 'Add time block'}</DialogTitle>
```

```tsx
            <Button type="submit" disabled={pending}>
              {editing ? 'Save' : 'Add block'}
            </Button>
```

Backlog keeps omitting `block` — no backlog file change.

- [ ] **Step 4: Typecheck the modal**

Run: `npx tsc --noEmit`

Expected: Failures, if any, are only missing `onEditBlock` on `TimeBlockChip` callers until Tasks 4–5. The modal itself should typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/components/time-block/AddTimeBlockModal.tsx
git commit -m "feat: reuse add time-block modal for edit"
```

---

### Task 4: DayRail scroll + empty click + Today wiring

**Files:**
- Modify: `src/components/calendar/DayRail.tsx`
- Modify: `src/routes/_authenticated/today.tsx`

**Interfaces:**
- Consumes: `CALENDAR_START_HOUR`, `CALENDAR_END_HOUR`, `CALENDAR_VISIBLE_HOURS`, `HOUR_HEIGHT`, `emptySlotStartFromPointer`, `dropRangeFromPointer`, `isTimeBlockChipTarget`, `onEditBlock`
- Produces: DayRail callbacks `onEmptySlotClick` and `onEditBlock`; Today modal draft

- [ ] **Step 1: Update DayRail props and scroller**

Remove `const DAY_RAIL_END_HOUR = 18`.

Update the calendarGeometry import to include `CALENDAR_END_HOUR`, `CALENDAR_VISIBLE_HOURS`, `emptySlotStartFromPointer` (keep `dropRangeFromPointer`). Import `formatDateKey` from `~/lib/dates` and `isTimeBlockChipTarget` from `../../lib/timeBlockAppearance`. Change the react import to:

```ts
import { useRef } from 'react'
import type { DragEvent, MouseEvent } from 'react'
```

Add props:

```ts
  onEmptySlotClick: (args: { startMs: number; dateKey: string }) => void
  onEditBlock: (block: Doc<'timeBlocks'>) => void
```

Destructure them. Hours:

```ts
  const hours = hoursInRange(CALENDAR_START_HOUR, CALENDAR_END_HOUR)
```

Replace `handleRailDrop` and add click:

```ts
  const handleRailDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const taskId = readTaskDragId(event.dataTransfer)
    if (!taskId || !railRef.current) return
    const { start, end } = dropRangeFromPointer({
      clientY: event.clientY,
      railTop: railRef.current.getBoundingClientRect().top,
      scrollTop: railRef.current.scrollTop,
      dayStartMs,
    })
    onCreateFromTask(taskId as Doc<'tasks'>['_id'], start, end)
  }

  const handleRailClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!railRef.current) return
    if (isTimeBlockChipTarget(event.target)) return
    const startMs = emptySlotStartFromPointer({
      clientY: event.clientY,
      railTop: railRef.current.getBoundingClientRect().top,
      scrollTop: railRef.current.scrollTop,
      dayStartMs,
    })
    onEmptySlotClick({ startMs, dateKey: formatDateKey(date) })
  }
```

Replace the rail `div` (the one with `ref={railRef}`) classes and handlers:

```tsx
      <div
        ref={railRef}
        className="relative overflow-y-auto rounded-xl border border-border bg-card shadow-soft"
        style={{
          maxHeight: `min(70vh, ${CALENDAR_VISIBLE_HOURS * HOUR_HEIGHT}px)`,
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleRailDrop}
        onClick={handleRailClick}
      >
```

Pass `onEditBlock={onEditBlock}` into `TimeBlockChip`.

- [ ] **Step 2: Wire Today page**

In `src/routes/_authenticated/today.tsx` replace `const [addBlockOpen, setAddBlockOpen] = useState(false)` with:

```ts
  const [blockModal, setBlockModal] = useState<{
    start?: number
    dateKey?: string
    block?: Doc<'timeBlocks'> | null
  } | null>(null)
```

`+ Add time block` button: `onClick={() => setBlockModal({ dateKey: data.dateKey })}`.

On `DayRail` add:

```tsx
          onEmptySlotClick={({ startMs, dateKey }) =>
            setBlockModal({ start: startMs, dateKey })
          }
          onEditBlock={(block) => setBlockModal({ block })}
```

Replace `AddTimeBlockModal`:

```tsx
      <AddTimeBlockModal
        open={blockModal != null}
        onClose={() => setBlockModal(null)}
        block={blockModal?.block}
        defaultDateKey={blockModal?.dateKey ?? data.dateKey}
        defaultStart={blockModal?.start}
      />
```

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run src/lib/calendarGeometry.test.ts`

Expected: PASS.

- [ ] **Step 4: Manual Today**

With `npm run dev`: Today → scroll 00 through 23; empty click ~14:07 opens add with today + ~14:00/14:15; pencil opens Edit; Save; drag/resize/review/delete still work; header Add still opens empty add.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/DayRail.tsx src/routes/_authenticated/today.tsx src/components/calendar/TimeBlockChip.tsx src/lib/timeBlockAppearance.ts
git commit -m "feat: scrollable full-day Today rail with click-to-add and edit"
```

---

### Task 5: WeekView same behavior + Calendar wiring

**Files:**
- Modify: `src/components/calendar/WeekView.tsx`
- Modify: `src/routes/_authenticated/calendar.tsx`

**Interfaces:**
- Consumes: same geometry helpers as DayRail
- Produces: WeekView `onEmptySlotClick` / `onEditBlock`; one shared hour scroller; Calendar modal draft

- [ ] **Step 1: WeekView props, scroller ref, hours**

Remove `const WEEK_END_HOUR = 19`.

Add `CALENDAR_END_HOUR`, `CALENDAR_VISIBLE_HOURS`, `emptySlotStartFromPointer` to the calendarGeometry import. Add `isTimeBlockChipTarget` from `../../lib/timeBlockAppearance`. Change the react import to:

```ts
import { useMemo, useRef } from 'react'
import type { MouseEvent } from 'react'
```

Add props:

```ts
  onEmptySlotClick: (args: { startMs: number; dateKey: string }) => void
  onEditBlock: (block: Doc<'timeBlocks'>) => void
```

Destructure them. Inside the component:

```ts
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const hours = hoursInRange(CALENDAR_START_HOUR, CALENDAR_END_HOUR)

  function scrollerPointer() {
    const scroller = gridScrollRef.current
    if (!scroller) return null
    return {
      railTop: scroller.getBoundingClientRect().top,
      scrollTop: scroller.scrollTop,
    }
  }
```

Wrap **only** the existing `grid grid-cols-[44px_1fr]` hour+columns block (not the weekday header) with:

```tsx
        <div
          ref={gridScrollRef}
          className="overflow-y-auto"
          style={{
            maxHeight: `min(70vh, ${CALENDAR_VISIBLE_HOURS * HOUR_HEIGHT}px)`,
          }}
        >
```

Keep the weekday header grid as a **sibling above** this scroller, still inside the rounded card.

Remove `min-h-[406px]` from day column className (keep `relative` and `border-l`).

On each day column `onDrop`, after reading `taskId`, use the shared scroller (not the column rect):

```ts
                    const pointer = scrollerPointer()
                    if (!pointer) return
                    const { start, end } = dropRangeFromPointer({
                      clientY: event.clientY,
                      railTop: pointer.railTop,
                      scrollTop: pointer.scrollTop,
                      dayStartMs: dayStart,
                    })
```

On each day column add `onClick`:

```tsx
                  onClick={(event: MouseEvent<HTMLDivElement>) => {
                    if (isTimeBlockChipTarget(event.target)) return
                    const pointer = scrollerPointer()
                    if (!pointer) return
                    const startMs = emptySlotStartFromPointer({
                      clientY: event.clientY,
                      railTop: pointer.railTop,
                      scrollTop: pointer.scrollTop,
                      dayStartMs: dayStart,
                    })
                    onEmptySlotClick({
                      startMs,
                      dateKey: formatDateKey(day),
                    })
                  }}
```

Pass `onEditBlock={onEditBlock}` to each `TimeBlockChip`.

- [ ] **Step 2: Wire Calendar page**

Replace `const [addBlockOpen, setAddBlockOpen] = useState(false)` with the same `blockModal` state as Today.

`+ New block`: `onClick={() => setBlockModal({})}`.

On `WeekView`:

```tsx
        onEmptySlotClick={({ startMs, dateKey }) =>
          setBlockModal({ start: startMs, dateKey })
        }
        onEditBlock={(block) => setBlockModal({ block })}
```

Replace `AddTimeBlockModal`:

```tsx
      <AddTimeBlockModal
        open={blockModal != null}
        onClose={() => setBlockModal(null)}
        block={blockModal?.block}
        defaultDateKey={blockModal?.dateKey}
        defaultStart={blockModal?.start}
      />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Manual Calendar**

Week header stays put while hours 0–23 scroll together across all seven days. Empty click on Wednesday ~14:07 opens add with Wednesday’s date. Pencil edits. Task drop on a scrolled column matches the visible hour. `+ New block` still opens add with default 09:00.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/WeekView.tsx src/routes/_authenticated/calendar.tsx
git commit -m "feat: week grid matches Today scroll, add, and edit"
```

---

## Self-review

1. **Spec coverage:** Full-day hours (T1), scrollTop (T1, T4, T5), snap/clamp 23:00 (T1), DayRail scroll (T4), Week sticky header + shared scroller (T5), empty click dateKey (T4/T5), edit pencil (T2), shared modal (T3), both pages (T4/T5). Out of scope left out.
2. **Placeholders:** None.
3. **Types:** `onEmptySlotClick({ startMs, dateKey })` maps to `{ start, dateKey }` on the page; modal uses `defaultStart` / `defaultDateKey` / `block`.
