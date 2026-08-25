# DayRail Clean Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DayRail (and WeekView) share one calendar geometry module and one block chip, with pointer-capture drag that previews locally and writes Convex once on pointer-up.

**Architecture:** Extract pure calendar math and block appearance behind small functions. `TimeBlockChip` owns chrome and review/delete/resize. `useBlockPointerDrag` is a thin pointer-capture adapter over those functions. DayRail and WeekView become layout shells that place chips on a hour grid.

**Tech Stack:** React 19, TypeScript, Vitest (pure unit tests), existing Convex mutations left in route files.

## Global Constraints

- Do not enable the React Compiler or add `use()`, `useOptimistic`, or `useActionState`.
- Do not add React Testing Library / jsdom. Test pure functions in Vitest; verify UI by hand.
- Do not change Convex schema, `timeBlocks.update`, or review modal behavior.
- Keep `onReviewBlock(block)` / `onRemoveBlock(block)` taking the full `Doc<'timeBlocks'>` (callers store that doc in React state).
- `HOUR_HEIGHT` is `54` (matches `WeekView` and `.cal-grid`). DayRail hour rows must use that value, not `62px`.
- Drag/resize commits **once** on `pointerup`. Live `onUpdateBlock` during move is forbidden.
- Import DOM event types from `'react'` (`import type { PointerEvent, DragEvent } from 'react'`), not the `React.*` namespace.
- Commit only when the user asked to commit. If they have not, skip every Commit step.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/calendarGeometry.ts` | Hour/pixel conversion, drop range, gesture preview → times |
| `src/lib/calendarGeometry.test.ts` | Tests for the geometry module |
| `src/lib/timeBlockAppearance.ts` | Tone color, review border, outcome label, `blockNeedsReview`, control hit-test |
| `src/lib/timeBlockAppearance.test.ts` | Tests for appearance/review helpers |
| `src/components/calendar/useBlockPointerDrag.ts` | Pointer capture + local preview; calls `onCommit` once |
| `src/components/calendar/TimeBlockChip.tsx` | Block chrome (title, subtitle, review, delete, resize) |
| `src/components/calendar/DayRail.tsx` | Day grid + optional task palette + chips |
| `src/components/calendar/WeekView.tsx` | Week grid consuming the same geometry + chip |
| `src/routes/_authenticated/today.tsx` | Drop unused DayRail props; pass `now` |
| `src/routes/_authenticated/calendar.tsx` | Pass `now` into WeekView |
| `vitest.config.ts` | Also run `src/**/*.test.ts` |

Out of scope: React Compiler, keyboard block move, extracting a shared task-palette component, TaskHistory outcome labels, changing `.cal-grid` CSS.

---

### Task 1: Calendar geometry module

**Files:**
- Create: `src/lib/calendarGeometry.ts`
- Create: `src/lib/calendarGeometry.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing from later tasks
- Produces: `HOUR_HEIGHT`, `CALENDAR_START_HOUR`, `MIN_CHIP_HEIGHT`, `SUBTITLE_MIN_HEIGHT`, `DEFAULT_BLOCK_DURATION_MS`, `MS_PER_HOUR`, `TASK_DRAG_TYPE`, `hoursInRange`, `msToTop`, `topToMs`, `blockLayout`, `dropRangeFromPointer`, `BlockGesture`, `gestureLayout`, `gestureTimes`

- [ ] **Step 1: Include `src` tests in Vitest**

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts', 'src/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
})
```

- [ ] **Step 2: Write the failing geometry tests**

Create `src/lib/calendarGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CALENDAR_START_HOUR,
  DEFAULT_BLOCK_DURATION_MS,
  HOUR_HEIGHT,
  MIN_CHIP_HEIGHT,
  MS_PER_HOUR,
  blockLayout,
  dropRangeFromPointer,
  gestureLayout,
  gestureTimes,
  hoursInRange,
  msToTop,
  topToMs,
} from './calendarGeometry'

const dayStart = Date.UTC(2026, 7, 24)

describe('hoursInRange', () => {
  it('returns each hour in [start, end)', () => {
    expect(hoursInRange(7, 10)).toEqual([7, 8, 9])
  })
})

describe('msToTop / topToMs', () => {
  it('maps calendar start hour to top 0', () => {
    const startHourMs = dayStart + CALENDAR_START_HOUR * MS_PER_HOUR
    expect(msToTop(startHourMs, dayStart)).toBe(0)
  })

  it('is invertible for on-grid times', () => {
    const top = HOUR_HEIGHT * 2
    expect(msToTop(topToMs(top, dayStart), dayStart)).toBe(top)
  })
})

describe('blockLayout', () => {
  it('sizes a 1-hour block to HOUR_HEIGHT', () => {
    const start = dayStart + 9 * MS_PER_HOUR
    const end = start + MS_PER_HOUR
    expect(blockLayout(start, end, dayStart)).toEqual({
      top: (9 - CALENDAR_START_HOUR) * HOUR_HEIGHT,
      height: HOUR_HEIGHT,
    })
  })

  it('clamps very short blocks to MIN_CHIP_HEIGHT', () => {
    const start = dayStart + 9 * MS_PER_HOUR
    const end = start + 5 * 60 * 1000
    expect(blockLayout(start, end, dayStart).height).toBe(MIN_CHIP_HEIGHT)
  })
})

describe('dropRangeFromPointer', () => {
  it('creates a 1-hour block from a pointer Y inside the rail', () => {
    const railTop = 100
    const { start, end } = dropRangeFromPointer({
      clientY: 100 + HOUR_HEIGHT,
      railTop,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + (CALENDAR_START_HOUR + 1) * MS_PER_HOUR)
    expect(end - start).toBe(DEFAULT_BLOCK_DURATION_MS)
  })

  it('does not allow a drop above the rail', () => {
    const { start } = dropRangeFromPointer({
      clientY: 50,
      railTop: 100,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + CALENDAR_START_HOUR * MS_PER_HOUR)
  })
})

describe('gestureLayout / gestureTimes', () => {
  it('moves a block down by delta Y and keeps duration', () => {
    const durationMs = MS_PER_HOUR
    const originTop = 0
    const layout = gestureLayout(
      {
        kind: 'move',
        startClientY: 200,
        originTop,
        originHeight: HOUR_HEIGHT,
      },
      200 + HOUR_HEIGHT,
    )
    expect(layout).toEqual({ top: HOUR_HEIGHT, height: HOUR_HEIGHT })

    const times = gestureTimes(
      {
        kind: 'move',
        startClientY: 200,
        originTop,
        originHeight: HOUR_HEIGHT,
      },
      200 + HOUR_HEIGHT,
      dayStart,
      durationMs,
    )
    expect(times.end - times.start).toBe(durationMs)
    expect(times.start).toBe(topToMs(HOUR_HEIGHT, dayStart))
  })

  it('does not move a block above the rail', () => {
    const layout = gestureLayout(
      {
        kind: 'move',
        startClientY: 200,
        originTop: 10,
        originHeight: HOUR_HEIGHT,
      },
      100,
    )
    expect(layout.top).toBe(0)
  })

  it('resizes from the bottom and clamps to MIN_CHIP_HEIGHT', () => {
    const layout = gestureLayout(
      {
        kind: 'resize',
        startClientY: 300,
        originTop: 0,
        originHeight: HOUR_HEIGHT,
      },
      250,
    )
    expect(layout.height).toBe(MIN_CHIP_HEIGHT)
    expect(layout.top).toBe(0)
  })

  it('keeps start fixed while resizing', () => {
    const originTop = HOUR_HEIGHT
    const times = gestureTimes(
      {
        kind: 'resize',
        startClientY: 400,
        originTop,
        originHeight: HOUR_HEIGHT,
      },
      400 + HOUR_HEIGHT,
      dayStart,
      MS_PER_HOUR,
    )
    expect(times.start).toBe(topToMs(originTop, dayStart))
    expect(times.end).toBe(topToMs(originTop + HOUR_HEIGHT * 2, dayStart))
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/calendarGeometry.test.ts`

Expected: FAIL with cannot find module `./calendarGeometry` (or named export errors).

- [ ] **Step 4: Implement the geometry module**

Create `src/lib/calendarGeometry.ts`:

```ts
export const HOUR_HEIGHT = 54
export const CALENDAR_START_HOUR = 7
export const MIN_CHIP_HEIGHT = 24
export const SUBTITLE_MIN_HEIGHT = 32
export const MS_PER_HOUR = 3_600_000
export const DEFAULT_BLOCK_DURATION_MS = MS_PER_HOUR
export const TASK_DRAG_TYPE = 'text/plain'

export function hoursInRange(startHour: number, endHour: number): number[] {
  return Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
}

export function msToTop(ms: number, dayStartMs: number): number {
  const hours = (ms - dayStartMs) / MS_PER_HOUR
  return (hours - CALENDAR_START_HOUR) * HOUR_HEIGHT
}

export function topToMs(top: number, dayStartMs: number): number {
  const hours = top / HOUR_HEIGHT + CALENDAR_START_HOUR
  return dayStartMs + hours * MS_PER_HOUR
}

export function blockLayout(
  start: number,
  end: number,
  dayStartMs: number,
): { top: number; height: number } {
  return {
    top: msToTop(start, dayStartMs),
    height: Math.max(MIN_CHIP_HEIGHT, ((end - start) / MS_PER_HOUR) * HOUR_HEIGHT),
  }
}

export function dropRangeFromPointer(args: {
  clientY: number
  railTop: number
  dayStartMs: number
}): { start: number; end: number } {
  const top = Math.max(0, args.clientY - args.railTop)
  const start = topToMs(top, args.dayStartMs)
  return { start, end: start + DEFAULT_BLOCK_DURATION_MS }
}

export type BlockGesture = {
  kind: 'move' | 'resize'
  startClientY: number
  originTop: number
  originHeight: number
}

export function gestureLayout(
  gesture: BlockGesture,
  clientY: number,
): { top: number; height: number } {
  const delta = clientY - gesture.startClientY
  if (gesture.kind === 'move') {
    return {
      top: Math.max(0, gesture.originTop + delta),
      height: gesture.originHeight,
    }
  }
  return {
    top: gesture.originTop,
    height: Math.max(MIN_CHIP_HEIGHT, gesture.originHeight + delta),
  }
}

export function gestureTimes(
  gesture: BlockGesture,
  clientY: number,
  dayStartMs: number,
  durationMs: number,
): { start: number; end: number } {
  const { top, height } = gestureLayout(gesture, clientY)
  if (gesture.kind === 'move') {
    const start = topToMs(top, dayStartMs)
    return { start, end: start + durationMs }
  }
  return {
    start: topToMs(gesture.originTop, dayStartMs),
    end: topToMs(top + height, dayStartMs),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/calendarGeometry.test.ts`

Expected: PASS (all tests green). Then run `npx vitest run` and confirm existing Convex tests still pass.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/lib/calendarGeometry.ts src/lib/calendarGeometry.test.ts
git commit -m "$(cat <<'EOF'
Extract shared calendar geometry with tests.

EOF
)"
```

---

### Task 2: Block appearance and review helpers

**Files:**
- Create: `src/lib/timeBlockAppearance.ts`
- Create: `src/lib/timeBlockAppearance.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: `ReviewOutcome`, `blockToneClass`, `reviewBorderClass`, `reviewOutcomeLabel`, `blockNeedsReview`, `isBlockControl`

- [ ] **Step 1: Write the failing appearance tests**

Create `src/lib/timeBlockAppearance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  blockNeedsReview,
  blockToneClass,
  isBlockControl,
  reviewBorderClass,
  reviewOutcomeLabel,
} from './timeBlockAppearance'

describe('blockToneClass', () => {
  it('uses google tone for google-origin blocks', () => {
    expect(blockToneClass({ origin: 'google' })).toBe('bg-event-google')
  })

  it('uses work tone when a task is linked', () => {
    expect(blockToneClass({ origin: 'app', taskId: 'jd7task' })).toBe(
      'bg-event-work',
    )
  })

  it('uses personal tone otherwise', () => {
    expect(blockToneClass({ origin: 'app' })).toBe('bg-event-personal')
  })
})

describe('reviewBorderClass', () => {
  it('keeps a transparent 3px border when unreviewed', () => {
    expect(reviewBorderClass(undefined)).toBe('border-l-[3px] border-l-transparent')
  })

  it('maps outcomes to success / warning / destructive', () => {
    expect(reviewBorderClass('done')).toBe('border-l-[3px] border-l-success')
    expect(reviewBorderClass('partial')).toBe('border-l-[3px] border-l-warning')
    expect(reviewBorderClass('missed')).toBe(
      'border-l-[3px] border-l-destructive',
    )
  })
})

describe('reviewOutcomeLabel', () => {
  it('returns the locked display labels', () => {
    expect(reviewOutcomeLabel('done')).toBe('Done')
    expect(reviewOutcomeLabel('partial')).toBe('Partial')
    expect(reviewOutcomeLabel('missed')).toBe('Missed')
  })
})

describe('blockNeedsReview', () => {
  const now = 1_000_000
  const base = {
    origin: 'app' as const,
    taskId: 'jd7task',
    end: now - 1,
  }

  it('is true for a past unreviewed app block with a task', () => {
    expect(blockNeedsReview(base, now)).toBe(true)
  })

  it('is false when the block has not ended', () => {
    expect(blockNeedsReview({ ...base, end: now + 1 }, now)).toBe(false)
  })

  it('is false once reviewed', () => {
    expect(
      blockNeedsReview({ ...base, review: { outcome: 'done' } }, now),
    ).toBe(false)
  })

  it('is false for google blocks and blocks without a task', () => {
    expect(blockNeedsReview({ ...base, origin: 'google' }, now)).toBe(false)
    expect(blockNeedsReview({ ...base, taskId: undefined }, now)).toBe(false)
  })
})

describe('isBlockControl', () => {
  it('is true for review and delete controls', () => {
    const review = document.createElement('button')
    review.setAttribute('data-review-button', 'true')
    const deleteBtn = document.createElement('button')
    deleteBtn.setAttribute('data-delete-button', 'true')
    expect(isBlockControl(review)).toBe(true)
    expect(isBlockControl(deleteBtn)).toBe(true)
  })

  it('is false for other elements', () => {
    expect(isBlockControl(document.createElement('div'))).toBe(false)
    expect(isBlockControl(null)).toBe(false)
  })
})
```

`isBlockControl` uses `document`. If `edge-runtime` throws `document is not defined`, skip those two tests and keep `isBlockControl` anyway — it is a 6-line DOM helper. Do not add jsdom.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/timeBlockAppearance.test.ts`

Expected: FAIL with cannot find module `./timeBlockAppearance`.

- [ ] **Step 3: Implement the appearance module**

Create `src/lib/timeBlockAppearance.ts`:

```ts
export type ReviewOutcome = 'done' | 'partial' | 'missed'

export type BlockToneInput = {
  origin: 'app' | 'google'
  taskId?: string
}

export type BlockReviewInput = BlockToneInput & {
  end: number
  review?: { outcome: ReviewOutcome }
}

export function blockToneClass(block: BlockToneInput): string {
  if (block.origin === 'google') return 'bg-event-google'
  if (block.taskId) return 'bg-event-work'
  return 'bg-event-personal'
}

export function reviewBorderClass(outcome: ReviewOutcome | undefined): string {
  if (outcome === 'done') return 'border-l-[3px] border-l-success'
  if (outcome === 'partial') return 'border-l-[3px] border-l-warning'
  if (outcome === 'missed') return 'border-l-[3px] border-l-destructive'
  return 'border-l-[3px] border-l-transparent'
}

export function reviewOutcomeLabel(outcome: ReviewOutcome): string {
  if (outcome === 'done') return 'Done'
  if (outcome === 'partial') return 'Partial'
  return 'Missed'
}

export function blockNeedsReview(block: BlockReviewInput, now: number): boolean {
  return (
    block.origin === 'app' &&
    block.taskId != null &&
    block.end <= now &&
    block.review === undefined
  )
}

export function isBlockControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest('[data-review-button="true"], [data-delete-button="true"]'),
    )
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/timeBlockAppearance.test.ts`

Expected: PASS. If `isBlockControl` tests fail for missing `document`, delete only that `describe` block and re-run until green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeBlockAppearance.ts src/lib/timeBlockAppearance.test.ts
git commit -m "$(cat <<'EOF'
Extract time-block appearance and review helpers.

EOF
)"
```

---

### Task 3: TimeBlockChip and pointer-capture drag

**Files:**
- Create: `src/components/calendar/useBlockPointerDrag.ts`
- Create: `src/components/calendar/TimeBlockChip.tsx`

**Interfaces:**
- Consumes: Task 1 geometry (`blockLayout` is used by parents; chip consumes `gestureLayout` / `gestureTimes` via the hook, plus `SUBTITLE_MIN_HEIGHT`) and Task 2 appearance helpers
- Produces: `TimeBlockChip` and `useBlockPointerDrag` with the signatures below

`useBlockPointerDrag` signature:

```ts
function useBlockPointerDrag(args: {
  top: number
  height: number
  dayStartMs: number
  durationMs: number
  onCommit: (patch: { start: number; end: number }) => void
}): {
  displayedTop: number
  displayedHeight: number
  dragging: boolean
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void
}
```

`TimeBlockChip` props:

```ts
type TimeBlockChipProps = {
  block: Doc<'timeBlocks'>
  taskTitle?: string
  needsReview: boolean
  top: number
  height: number
  dayStartMs: number
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
  onRemoveBlock: (block: Doc<'timeBlocks'>) => void
}
```

- [ ] **Step 1: Implement `useBlockPointerDrag`**

Create `src/components/calendar/useBlockPointerDrag.ts`. Preview in local state during the gesture. Call `onCommit` only on `pointerup`. Revert preview on `pointercancel` without committing.

```ts
import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import {
  type BlockGesture,
  gestureLayout,
  gestureTimes,
} from '../../lib/calendarGeometry'
import { isBlockControl } from '../../lib/timeBlockAppearance'

export function useBlockPointerDrag(args: {
  top: number
  height: number
  dayStartMs: number
  durationMs: number
  onCommit: (patch: { start: number; end: number }) => void
}) {
  const { top, height, dayStartMs, durationMs, onCommit } = args
  const gestureRef = useRef<BlockGesture | null>(null)
  const [preview, setPreview] = useState<{ top: number; height: number } | null>(
    null,
  )

  const displayedTop = preview?.top ?? top
  const displayedHeight = preview?.height ?? height
  const dragging = preview != null && gestureRef.current?.kind === 'move'

  function begin(kind: BlockGesture['kind'], event: PointerEvent<HTMLDivElement>) {
    const gesture: BlockGesture = {
      kind,
      startClientY: event.clientY,
      originTop: top,
      originHeight: height,
    }
    gestureRef.current = gesture
    event.currentTarget.setPointerCapture(event.pointerId)
    setPreview(gestureLayout(gesture, event.clientY))
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    if (isBlockControl(event.target)) return
    const resize =
      event.target instanceof HTMLElement &&
      event.target.closest('[data-resize-handle="true"]')
    begin(resize ? 'resize' : 'move', event)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture) return
    setPreview(gestureLayout(gesture, event.clientY))
  }

  function finish(
    event: PointerEvent<HTMLDivElement>,
    shouldCommit: boolean,
  ) {
    const gesture = gestureRef.current
    if (!gesture) return
    if (shouldCommit) {
      onCommit(gestureTimes(gesture, event.clientY, dayStartMs, durationMs))
    }
    gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setPreview(null)
  }

  return {
    displayedTop,
    displayedHeight,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) =>
      finish(event, false),
  }
}
```

- [ ] **Step 2: Implement `TimeBlockChip`**

Create `src/components/calendar/TimeBlockChip.tsx`. Always paint the 3px left border (transparent when unreviewed) so layout does not shift. Resize control is a `<button>`.

```tsx
import { Trash2 } from 'lucide-react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { SUBTITLE_MIN_HEIGHT } from '../../lib/calendarGeometry'
import {
  blockToneClass,
  reviewBorderClass,
  reviewOutcomeLabel,
} from '../../lib/timeBlockAppearance'
import { useBlockPointerDrag } from './useBlockPointerDrag'

type TimeBlockChipProps = {
  block: Doc<'timeBlocks'>
  taskTitle?: string
  needsReview: boolean
  top: number
  height: number
  dayStartMs: number
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
  onRemoveBlock: (block: Doc<'timeBlocks'>) => void
}

export function TimeBlockChip({
  block,
  taskTitle,
  needsReview: showReview,
  top,
  height,
  dayStartMs,
  onUpdateBlock,
  onReviewBlock,
  onRemoveBlock,
}: TimeBlockChipProps) {
  const drag = useBlockPointerDrag({
    top,
    height,
    dayStartMs,
    durationMs: block.end - block.start,
    onCommit: (patch) => onUpdateBlock(block._id, patch),
  })

  const reviewOutcome = block.review?.outcome
  const showTaskSubtitle = Boolean(taskTitle) && drag.displayedHeight >= SUBTITLE_MIN_HEIGHT
  const showOutcomeLabel =
    Boolean(reviewOutcome) && drag.displayedHeight >= SUBTITLE_MIN_HEIGHT

  return (
    <div
      className={cn(
        'group absolute inset-x-2 overflow-hidden rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-white',
        blockToneClass(block),
        reviewBorderClass(reviewOutcome),
      )}
      style={{
        top: drag.displayedTop,
        height: drag.displayedHeight,
        cursor: drag.dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate">{block.title}</div>
          {showTaskSubtitle ? (
            <div className="truncate text-[10px] font-normal text-white/80">
              {taskTitle}
            </div>
          ) : null}
        </div>
        {showOutcomeLabel && reviewOutcome ? (
          <span className="shrink-0 text-[10px] font-semibold text-white/90">
            {reviewOutcomeLabel(reviewOutcome)}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {block.origin === 'google' ? (
          <span className="rounded border border-white/50 px-1 py-0.5 text-[10px] opacity-85">
            Google
          </span>
        ) : null}
        {showReview && onReviewBlock ? (
          <button
            type="button"
            data-review-button="true"
            className="rounded bg-white/30 px-1 py-0.5 text-[10px] font-semibold hover:bg-white/50"
            onClick={(event) => {
              event.stopPropagation()
              onReviewBlock(block)
            }}
          >
            Review
          </button>
        ) : null}
        <button
          type="button"
          data-delete-button="true"
          aria-label="Delete time block"
          className="ml-auto rounded bg-black/25 p-0.5 opacity-0 transition-opacity hover:bg-black/40 group-hover:opacity-100 group-focus-within:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onRemoveBlock(block)
          }}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <button
        type="button"
        data-resize-handle="true"
        aria-label="Resize time block"
        className="absolute right-1.5 bottom-1 size-2.5 cursor-ns-resize opacity-50"
      />
    </div>
  )
}
```

WeekView currently uses tighter inset (`inset-x-[3px]`) and smaller type. Accept DayRail’s chip styling in both views for this plan. Do not add a `density` prop.

- [ ] **Step 3: Typecheck the new files**

Run: `npx tsc --noEmit`

Expected: PASS, or only errors in DayRail/WeekView that still duplicate the old helpers (fixed in Tasks 4–5). If `useBlockPointerDrag.ts` or `TimeBlockChip.tsx` themselves error, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/useBlockPointerDrag.ts src/components/calendar/TimeBlockChip.tsx
git commit -m "$(cat <<'EOF'
Add TimeBlockChip with pointer-capture drag preview.

EOF
)"
```

---

### Task 4: Rewire DayRail and Today

**Files:**
- Modify: `src/components/calendar/DayRail.tsx` (replace the whole file)
- Modify: `src/routes/_authenticated/today.tsx` (DayRail call site only)

**Interfaces:**
- Consumes: `hoursInRange`, `HOUR_HEIGHT`, `blockLayout`, `dropRangeFromPointer`, `TASK_DRAG_TYPE`, `blockNeedsReview`, `TimeBlockChip`
- Produces: `DayRail` with this props type:

```ts
type DayRailProps = {
  blocks: Array<Doc<'timeBlocks'>>
  taskMap: Map<Id<'tasks'>, Doc<'tasks'>>
  date: Date
  now: number
  tasks?: Array<Doc<'tasks'>>
  onCreateFromTask: (
    taskId: Doc<'tasks'>['_id'],
    start: number,
    end: number,
  ) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
  onRemoveBlock: (block: Doc<'timeBlocks'>) => void
}
```

Removed: `showTaskPlanner`, optional `taskMap`, `title` on the update patch. Palette renders only when `tasks` is passed and non-empty.

- [ ] **Step 1: Replace `DayRail.tsx`**

Day rail visible hours stay `7–18` (exclusive end). Use `HOUR_HEIGHT` for row height. Read dropped task ids from `dataTransfer`, not React state.

```tsx
import { useRef } from 'react'
import type { DragEvent } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { startOfDayMs } from '~/lib/dates'
import {
  CALENDAR_START_HOUR,
  HOUR_HEIGHT,
  TASK_DRAG_TYPE,
  blockLayout,
  dropRangeFromPointer,
  hoursInRange,
} from '../../lib/calendarGeometry'
import { blockNeedsReview } from '../../lib/timeBlockAppearance'
import { TimeBlockChip } from './TimeBlockChip'

const DAY_RAIL_END_HOUR = 18

type DayRailProps = {
  blocks: Array<Doc<'timeBlocks'>>
  taskMap: Map<Id<'tasks'>, Doc<'tasks'>>
  date: Date
  now: number
  tasks?: Array<Doc<'tasks'>>
  onCreateFromTask: (
    taskId: Doc<'tasks'>['_id'],
    start: number,
    end: number,
  ) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
  onRemoveBlock: (block: Doc<'timeBlocks'>) => void
}

export function DayRail({
  blocks,
  taskMap,
  date,
  now,
  tasks,
  onCreateFromTask,
  onUpdateBlock,
  onReviewBlock,
  onRemoveBlock,
}: DayRailProps) {
  const dayStartMs = startOfDayMs(date)
  const railRef = useRef<HTMLDivElement>(null)
  const hours = hoursInRange(CALENDAR_START_HOUR, DAY_RAIL_END_HOUR)

  const handleRailDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const taskId = event.dataTransfer.getData(TASK_DRAG_TYPE) as
      | Doc<'tasks'>['_id']
      | ''
    if (!taskId || !railRef.current) return
    const { start, end } = dropRangeFromPointer({
      clientY: event.clientY,
      railTop: railRef.current.getBoundingClientRect().top,
      dayStartMs,
    })
    onCreateFromTask(taskId, start, end)
  }

  return (
    <div>
      {tasks && tasks.length > 0 ? (
        <div className="mb-3 flex flex-col gap-2">
          {tasks.map((task) => (
            <div
              key={task._id}
              className="cursor-grab rounded-md border border-dashed border-slate-300 bg-secondary px-2.5 py-2 text-[13px]"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(TASK_DRAG_TYPE, task._id)
                event.dataTransfer.effectAllowed = 'copy'
              }}
            >
              ⠿ {task.title}
            </div>
          ))}
        </div>
      ) : null}
      <div
        ref={railRef}
        className="relative overflow-hidden rounded-xl border border-border bg-card shadow-soft"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleRailDrop}
      >
        {hours.map((hour) => (
          <div
            key={hour}
            className="relative border-t border-border first:border-t-0"
            style={{ height: HOUR_HEIGHT }}
          >
            <span className="absolute -top-2 left-2.5 bg-card px-1 text-[11px] text-muted-foreground">
              {String(hour).padStart(2, '0')}
            </span>
          </div>
        ))}
        {blocks.map((block) => {
          const { top, height } = blockLayout(block.start, block.end, dayStartMs)
          const linkedTask = block.taskId ? taskMap.get(block.taskId) : null
          return (
            <TimeBlockChip
              key={block._id}
              block={block}
              taskTitle={linkedTask?.title}
              needsReview={blockNeedsReview(block, now)}
              top={top}
              height={height}
              dayStartMs={dayStartMs}
              onUpdateBlock={onUpdateBlock}
              onReviewBlock={onReviewBlock}
              onRemoveBlock={onRemoveBlock}
            />
          )
        })}
      </div>
    </div>
  )
}
```

Delete `DraggableBlock` from this file. It now lives in `TimeBlockChip.tsx`.

- [ ] **Step 2: Update the Today call site**

In `src/routes/_authenticated/today.tsx`, replace the `DayRail` JSX with:

```tsx
        <DayRail
          blocks={blocks}
          taskMap={taskMap}
          date={new Date()}
          now={Date.now()}
          onCreateFromTask={(taskId, start, end) =>
            void createFromTask({ taskId, start, end })
          }
          onUpdateBlock={(blockId, patch) =>
            void updateBlock({ blockId, ...patch })
          }
          onReviewBlock={setRailReviewBlock}
          onRemoveBlock={setBlockToDelete}
        />
```

Do not pass `tasks` or `showTaskPlanner`. Leave `createFromTask` wired so a future palette still works.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: DayRail/today are clean. WeekView may still typecheck (it has not been switched yet).

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/DayRail.tsx src/routes/_authenticated/today.tsx
git commit -m "$(cat <<'EOF'
Rewire DayRail onto shared geometry and TimeBlockChip.

EOF
)"
```

---

### Task 5: Rewire WeekView

**Files:**
- Modify: `src/components/calendar/WeekView.tsx`
- Modify: `src/routes/_authenticated/calendar.tsx` (add `now` prop)

**Interfaces:**
- Consumes: same modules as Task 4, plus `TimeBlockChip`
- Produces: `WeekView` gains required `now: number`. Other props stay. Block move/resize now commits on pointer-up via `TimeBlockChip` (WeekView previously updated on every `mousemove` and had no resize). Task drops use `TASK_DRAG_TYPE` + `dropRangeFromPointer`.

Week visible hours stay `7–19`. Keep the existing week chrome (headers, unscheduled aside, legend, nav). Only the day columns and block chips change.

- [ ] **Step 1: Add `now` to WeekView props and the Calendar call site**

In `WeekViewProps` add `now: number`.

In `src/routes/_authenticated/calendar.tsx`, pass `now={Date.now()}` next to `anchorDate`.

- [ ] **Step 2: Delete local copies of geometry/appearance**

Remove from `WeekView.tsx`: `HOUR_HEIGHT`, `START_HOUR`, `END_HOUR`, `msToTop`, `eventColor`, `needsReview`.

Import:

```ts
import {
  CALENDAR_START_HOUR,
  HOUR_HEIGHT,
  TASK_DRAG_TYPE,
  blockLayout,
  dropRangeFromPointer,
  hoursInRange,
} from '../../lib/calendarGeometry'
import { blockNeedsReview } from '../../lib/timeBlockAppearance'
import { TimeBlockChip } from './TimeBlockChip'
```

Replace the hours memo with:

```ts
const WEEK_END_HOUR = 19
const hours = hoursInRange(CALENDAR_START_HOUR, WEEK_END_HOUR)
```

Hour gutter cells: replace `className="h-[54px] …"` with `style={{ height: HOUR_HEIGHT }}` plus the remaining classes (`border-t`, typography).

- [ ] **Step 3: Use dataTransfer for unscheduled tasks**

On each unscheduled task chip:

```tsx
draggable
onDragStart={(event) => {
  event.dataTransfer.setData(TASK_DRAG_TYPE, task._id)
  event.dataTransfer.effectAllowed = 'copy'
}}
```

Delete `const [dragTaskId, setDragTaskId] = useState<...>(null)`.

On each day column `onDrop`:

```tsx
onDragOver={(event) => event.preventDefault()}
onDrop={(event) => {
  event.preventDefault()
  const taskId = event.dataTransfer.getData(TASK_DRAG_TYPE) as
    | Doc<'tasks'>['_id']
    | ''
  if (!taskId) return
  const { start, end } = dropRangeFromPointer({
    clientY: event.clientY,
    railTop: event.currentTarget.getBoundingClientRect().top,
    dayStartMs: dayStart,
  })
  onCreateFromTask(taskId, start, end)
}}
```

- [ ] **Step 4: Render `TimeBlockChip` in each day column**

Replace the inline block `<div>` (including its `onMouseDown` window-listener drag) with:

```tsx
{dayBlocks.map((block) => {
  const { top, height } = blockLayout(block.start, block.end, dayStart)
  const linkedTask = block.taskId ? taskMap?.get(block.taskId) : null
  return (
    <TimeBlockChip
      key={block._id}
      block={block}
      taskTitle={linkedTask?.title}
      needsReview={blockNeedsReview(block, now)}
      top={top}
      height={height}
      dayStartMs={dayStart}
      onUpdateBlock={onUpdateBlock}
      onReviewBlock={onReviewBlock}
      onRemoveBlock={onRemoveBlock}
    />
  )
})}
```

Chip uses `inset-x-2`. That is slightly inset vs the old `inset-x-[3px]`. Accept it.

- [ ] **Step 5: Typecheck and unit tests**

Run:

```bash
npx tsc --noEmit
npx vitest run
```

Expected: `tsc` PASS. Vitest PASS for Convex tests plus `src/lib/*.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/components/calendar/WeekView.tsx src/routes/_authenticated/calendar.tsx
git commit -m "$(cat <<'EOF'
Point WeekView at shared geometry and TimeBlockChip.

EOF
)"
```

---

### Task 6: Manual verification

**Files:** none (browser)

**Interfaces:**
- Consumes: Tasks 1–5 running in `npm run dev`
- Produces: confirmation the interactions below work, or a bug list to fix before calling the plan done

- [ ] **Step 1: Today page — geometry and review chrome**

Open `/today` while signed in.

- Hour labels sit on rows that match block height (a 1-hour block fills one row).
- Task-linked past unreviewed blocks show Review.
- Reviewed blocks show Done / Partial / Missed and a 3px left border (`success` / `warning` / `destructive`). Unreviewed blocks have no colored border.
- Linked task title shows as a subtitle on blocks taller than ~32px.
- Delete is a button, visible on hover and keyboard focus-within.
- Resize handle is a button (`aria-label="Resize time block"`).

- [ ] **Step 2: Today page — pointer drag**

- Drag a block by the body: it follows the pointer even if the cursor leaves the chip.
- Convex / network only updates when you release, not on every pixel.
- Dragging onto Review or Delete does not start a move.
- Resize from the handle changes end time on release; start stays put.
- Cancel (ESC / OS gesture that fires `pointercancel`) snaps back without saving.

- [ ] **Step 3: Calendar page — shared chip + task drop**

Open `/calendar`.

- Unscheduled task drag onto a day column creates a 1-hour block at the drop Y.
- Existing blocks move/resize with the same pointer-up commit as Today.
- Weekend shading, week nav, and legend still work.
- Review and delete still open the existing modals.

- [ ] **Step 4: Fix anything Step 1–3 found, then re-run `npx tsc --noEmit` and `npx vitest run`**

Do not add new features while fixing. Re-verify the failing path.

---

## Spec coverage

| Requirement | Task |
|---|---|
| Shared geometry; `HOUR_HEIGHT` drives CSS and math | 1, 4, 5 |
| `needsReview(block, now)` is pure | 2, 4, 5 |
| Tone + 3px review border + outcome labels | 2, 3 |
| Pointer capture; local preview; one commit | 1 (`gestureTimes`), 3 |
| Narrow DayRail props; drop unused planner on Today | 4 |
| `dataTransfer` for task drops | 4, 5 |
| WeekView consumes the same chip (gains resize) | 5 |
| Resize handle is a button | 3 |
| No React Compiler / `use()` / Actions | Global constraints |
| Manual UI verification | 6 |
