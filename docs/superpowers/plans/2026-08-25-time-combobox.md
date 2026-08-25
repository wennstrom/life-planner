# Start/End time combobox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the add/edit time-block modal’s native start input and duration field with typeable Start and End comboboxes (15-minute lists, End labeled with duration, Start change keeps duration).

**Architecture:** Pure helpers in `src/lib/timeInput.ts` own parse/format/slots/duration/shift. `TimeCombobox` is a controlled-looking input with an internal draft and a Radix popover list. `AddTimeBlockModal` holds committed `HH:MM` strings and submits `start`/`end` ms as today.

**Tech Stack:** React 19, TypeScript, existing `radix-ui` Popover, Vitest for pure helpers only.

## Global Constraints

- Do not add npm packages. Use `import { Popover as PopoverPrimitive } from 'radix-ui'` (same pattern as Select).
- Do not add React Testing Library / jsdom. Test `timeInput.ts` in Vitest; verify combobox/modal by hand.
- Do not change Convex schema, `timeBlocks.create`, or `timeBlocks.update`.
- 24-hour times only. Same calendar day. Latest End is `23:59`. End must be strictly after Start. Off-grid typed minutes stay exact.
- Error copy on invalid range/parse at submit: `Enter a valid start and end time. End must be after start.`
- Import DOM/React event types from `'react'`, not the `React.*` namespace.
- Commit only when the user asked to commit. If they have not, skip every Commit step.
- Spec: `docs/superpowers/specs/2026-08-25-time-combobox-design.md`

## File structure

| File | Responsibility |
|---|---|
| `src/lib/timeInput.ts` | Parse/format, 15-minute slots, duration labels, End options, shift End when Start moves |
| `src/lib/timeInput.test.ts` | Vitest for the helpers |
| `src/components/ui/popover.tsx` | Thin Radix Popover wrapper (Input/Select style) |
| `src/components/time-block/TimeCombobox.tsx` | Typeable field + 15-minute popover list |
| `src/components/time-block/AddTimeBlockModal.tsx` | Start + End instead of duration; wire commit/shift/submit |

Out of scope: overnight blocks, AM/PM, chip drag/resize snap, new Convex functions.

---

### Task 1: Time input helpers

**Files:**
- Create: `src/lib/timeInput.ts`
- Create: `src/lib/timeInput.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `parseTimeInput(raw: string): { hours: number; minutes: number } | null`, `formatTime(hours: number, minutes: number): string`, `canonicalTime(raw: string): string | null`, `minutesFromCanonical(time: string): number | null`, `formatDurationLabel(durationMs: number): string`, `fifteenMinuteSlots(): string[]`, `startTimeOptions(): { value: string; label: string }[]`, `endTimeOptions(startTime: string): { value: string; label: string }[]`, `shiftEndPreservingDuration(args: { previousStart: string; previousEnd: string; nextStart: string }): string`, `isEndAfterStart(start: string, end: string): boolean`, `endAfterDuration(startTime: string, durationMinutes: number): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/timeInput.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  canonicalTime,
  endAfterDuration,
  endTimeOptions,
  formatDurationLabel,
  formatTime,
  isEndAfterStart,
  parseTimeInput,
  shiftEndPreservingDuration,
  startTimeOptions,
} from './timeInput'

describe('parseTimeInput', () => {
  it('accepts H:MM and HH:MM', () => {
    expect(parseTimeInput('9:07')).toEqual({ hours: 9, minutes: 7 })
    expect(parseTimeInput('09:07')).toEqual({ hours: 9, minutes: 7 })
    expect(parseTimeInput('0:00')).toEqual({ hours: 0, minutes: 0 })
    expect(parseTimeInput(' 09:07 ')).toEqual({ hours: 9, minutes: 7 })
  })

  it('accepts 3 or 4 digits with no separator', () => {
    expect(parseTimeInput('907')).toEqual({ hours: 9, minutes: 7 })
    expect(parseTimeInput('0930')).toEqual({ hours: 9, minutes: 30 })
    expect(parseTimeInput('000')).toEqual({ hours: 0, minutes: 0 })
  })

  it('rejects invalid clock times', () => {
    expect(parseTimeInput('')).toBeNull()
    expect(parseTimeInput('abc')).toBeNull()
    expect(parseTimeInput('9:7')).toBeNull()
    expect(parseTimeInput('9:99')).toBeNull()
    expect(parseTimeInput('24:00')).toBeNull()
    expect(parseTimeInput('25:00')).toBeNull()
    expect(parseTimeInput('9am')).toBeNull()
    expect(parseTimeInput('09:07 PM')).toBeNull()
  })
})

describe('formatTime', () => {
  it('zero-pads HH:MM', () => {
    expect(formatTime(9, 7)).toBe('09:07')
    expect(formatTime(0, 0)).toBe('00:00')
    expect(formatTime(23, 59)).toBe('23:59')
  })
})

describe('canonicalTime', () => {
  it('normalizes valid input', () => {
    expect(canonicalTime('9:07')).toBe('09:07')
    expect(canonicalTime('0930')).toBe('09:30')
    expect(canonicalTime('nope')).toBeNull()
  })
})

describe('formatDurationLabel', () => {
  it('formats minutes, hours, and mixed', () => {
    expect(formatDurationLabel(15 * 60_000)).toBe('15 min')
    expect(formatDurationLabel(45 * 60_000)).toBe('45 min')
    expect(formatDurationLabel(60 * 60_000)).toBe('1 hr')
    expect(formatDurationLabel(120 * 60_000)).toBe('2 hr')
    expect(formatDurationLabel(75 * 60_000)).toBe('1 hr 15 min')
    expect(formatDurationLabel(125 * 60_000)).toBe('2 hr 5 min')
  })
})

describe('startTimeOptions', () => {
  it('is 00:00 through 23:45 in 15-minute steps', () => {
    const options = startTimeOptions()
    expect(options).toHaveLength(96)
    expect(options[0]).toEqual({ value: '00:00', label: '00:00' })
    expect(options[1]).toEqual({ value: '00:15', label: '00:15' })
    expect(options.at(-1)).toEqual({ value: '23:45', label: '23:45' })
    expect(options.some((o) => o.value === '23:59')).toBe(false)
  })
})

describe('endTimeOptions', () => {
  it('starts after an off-grid start and includes 23:59 with duration labels', () => {
    const options = endTimeOptions('09:07')
    expect(options[0]?.value).toBe('09:15')
    expect(options[0]?.label).toBe('09:15 (8 min)')
    expect(options.find((o) => o.value === '10:07')).toBeUndefined()
    expect(options.find((o) => o.value === '10:00')?.label).toBe(
      '10:00 (53 min)',
    )
    expect(options.at(-1)?.value).toBe('23:59')
    expect(options.at(-1)?.label).toBe('23:59 (14 hr 52 min)')
  })

  it('lists 15-minute slots after an on-grid start', () => {
    const options = endTimeOptions('09:00')
    expect(options[0]).toEqual({
      value: '09:15',
      label: '09:15 (15 min)',
    })
    expect(options.find((o) => o.value === '10:00')?.label).toBe('10:00 (1 hr)')
  })
})

describe('shiftEndPreservingDuration', () => {
  it('moves End by the same duration', () => {
    expect(
      shiftEndPreservingDuration({
        previousStart: '09:00',
        previousEnd: '10:00',
        nextStart: '11:00',
      }),
    ).toBe('12:00')
  })

  it('keeps off-grid minutes', () => {
    expect(
      shiftEndPreservingDuration({
        previousStart: '09:07',
        previousEnd: '10:07',
        nextStart: '10:07',
      }),
    ).toBe('11:07')
  })

  it('clamps to 23:59', () => {
    expect(
      shiftEndPreservingDuration({
        previousStart: '09:00',
        previousEnd: '10:00',
        nextStart: '23:00',
      }),
    ).toBe('23:59')
  })
})

describe('endAfterDuration', () => {
  it('adds minutes and clamps to 23:59', () => {
    expect(endAfterDuration('09:00', 60)).toBe('10:00')
    expect(endAfterDuration('23:00', 60)).toBe('23:59')
  })
})

describe('isEndAfterStart', () => {
  it('requires a strictly later End', () => {
    expect(isEndAfterStart('09:00', '10:00')).toBe(true)
    expect(isEndAfterStart('09:00', '09:00')).toBe(false)
    expect(isEndAfterStart('23:59', '23:59')).toBe(false)
    expect(isEndAfterStart('09:07', '09:05')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/timeInput.test.ts`

Expected: FAIL (cannot find module `./timeInput` or exports are missing).

- [ ] **Step 3: Implement `src/lib/timeInput.ts`**

```ts
export type ParsedTime = { hours: number; minutes: number }

const END_OF_DAY_MINUTES = 23 * 60 + 59

export function formatTime(hours: number, minutes: number) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function parseTimeInput(raw: string): ParsedTime | null {
  const trimmed = raw.trim()
  if (!trimmed || /am|pm/i.test(trimmed)) return null

  let hours: number
  let minutes: number

  if (trimmed.includes(':')) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
    if (!match) return null
    hours = Number(match[1])
    minutes = Number(match[2])
  } else if (/^\d{3,4}$/.test(trimmed)) {
    if (trimmed.length === 3) {
      hours = Number(trimmed[0])
      minutes = Number(trimmed.slice(1))
    } else {
      hours = Number(trimmed.slice(0, 2))
      minutes = Number(trimmed.slice(2))
    }
  } else {
    return null
  }

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }

  return { hours, minutes }
}

export function canonicalTime(raw: string) {
  const parsed = parseTimeInput(raw)
  if (!parsed) return null
  return formatTime(parsed.hours, parsed.minutes)
}

export function minutesFromCanonical(time: string) {
  const parsed = parseTimeInput(time)
  if (!parsed) return null
  return parsed.hours * 60 + parsed.minutes
}

function timeFromMinutes(totalMinutes: number) {
  const clamped = Math.min(Math.max(totalMinutes, 0), END_OF_DAY_MINUTES)
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return formatTime(hours, minutes)
}

export function formatDurationLabel(durationMs: number) {
  const totalMin = Math.round(durationMs / 60_000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

export function fifteenMinuteSlots() {
  const slots: string[] = []
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    slots.push(timeFromMinutes(minutes))
  }
  return slots
}

export function startTimeOptions() {
  return fifteenMinuteSlots().map((value) => ({ value, label: value }))
}

function durationLabelBetween(startTime: string, endTime: string) {
  const start = minutesFromCanonical(startTime)
  const end = minutesFromCanonical(endTime)
  if (start == null || end == null) return ''
  return formatDurationLabel((end - start) * 60_000)
}

export function endTimeOptions(startTime: string) {
  const start = minutesFromCanonical(startTime)
  if (start == null) return []

  const options: { value: string; label: string }[] = []
  for (const value of fifteenMinuteSlots()) {
    const minutes = minutesFromCanonical(value)
    if (minutes == null || minutes <= start) continue
    options.push({
      value,
      label: `${value} (${durationLabelBetween(startTime, value)})`,
    })
  }

  if (start < END_OF_DAY_MINUTES) {
    const value = '23:59'
    const already = options.some((option) => option.value === value)
    if (!already) {
      options.push({
        value,
        label: `${value} (${durationLabelBetween(startTime, value)})`,
      })
    }
  }

  return options
}

export function isEndAfterStart(start: string, end: string) {
  const startMinutes = minutesFromCanonical(start)
  const endMinutes = minutesFromCanonical(end)
  if (startMinutes == null || endMinutes == null) return false
  return endMinutes > startMinutes
}

export function endAfterDuration(startTime: string, durationMinutes: number) {
  const start = minutesFromCanonical(startTime)
  if (start == null) return startTime
  return timeFromMinutes(start + durationMinutes)
}

export function shiftEndPreservingDuration({
  previousStart,
  previousEnd,
  nextStart,
}: {
  previousStart: string
  previousEnd: string
  nextStart: string
}) {
  const prevStart = minutesFromCanonical(previousStart)
  const prevEnd = minutesFromCanonical(previousEnd)
  const next = minutesFromCanonical(nextStart)
  if (prevStart == null || prevEnd == null || next == null) return previousEnd
  const duration = Math.max(prevEnd - prevStart, 0)
  return timeFromMinutes(next + duration)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/timeInput.test.ts`

Expected: PASS (all tests).

If `endTimeOptions` duration strings fail, adjust the test expectations only after checking `09:15 - 09:07 = 8 min` and `23:59 - 09:07 = 14 hr 52 min` by hand; do not change the formatter to match a wrong guess.

- [ ] **Step 5: Commit** (skip unless the user asked)

```bash
git add src/lib/timeInput.ts src/lib/timeInput.test.ts
git commit -m "$(cat <<'EOF'
Add 24-hour time parse, slot, and duration helpers for the block modal.

EOF
)"
```

---

### Task 2: Popover primitive and TimeCombobox

**Files:**
- Create: `src/components/ui/popover.tsx`
- Create: `src/components/time-block/TimeCombobox.tsx`

**Interfaces:**
- Consumes: `canonicalTime` from `~/lib/timeInput`
- Produces: `TimeCombobox` with props `{ id: string; value: string; onCommit: (next: string) => void; options: { value: string; label: string }[] }`

- [ ] **Step 1: Add `src/components/ui/popover.tsx`**

Match Select/Dialog: wrap `radix-ui` Popover, `data-slot` attributes, `cn` for content.

```tsx
import * as React from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { cn } from '~/lib/utils'

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
```

- [ ] **Step 2: Add `src/components/time-block/TimeCombobox.tsx`**

Behavior required by the spec:

- Input shows `value` unless the user is editing a `draft`.
- Focus or chevron opens the list (`open` true). Use `modal={false}` so it works inside `Dialog`.
- Filter options whose `value` or `label` includes the draft (case-insensitive). Empty draft shows all options.
- Clicking an option calls `onCommit(option.value)`, sets draft to that value, closes.
- Blur: `canonicalTime(draft)`; if valid `onCommit(canonical)` else revert draft to `value`.
- Escape: close list and set draft back to `value`.
- Do not call `onCommit` on every keystroke.

```tsx
import { useEffect, useId, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'

import { Input } from '~/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover'
import { canonicalTime } from '~/lib/timeInput'

export type TimeOption = { value: string; label: string }

type TimeComboboxProps = {
  id: string
  value: string
  onCommit: (next: string) => void
  options: TimeOption[]
}

export function TimeCombobox({
  id,
  value,
  onCommit,
  options,
}: TimeComboboxProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const query = draft.trim().toLowerCase()
  const filtered = query
    ? options.filter(
        (option) =>
          option.value.toLowerCase().includes(query) ||
          option.label.toLowerCase().includes(query),
      )
    : options

  const commitDraft = () => {
    const next = canonicalTime(draft)
    if (next) {
      onCommit(next)
      setDraft(next)
    } else {
      setDraft(value)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(value)
      setOpen(false)
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={commitDraft}
          onKeyDown={handleKeyDown}
          className="pr-8"
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Show times"
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground"
            onMouseDown={(event) => {
              event.preventDefault()
            }}
          >
            <ChevronDownIcon className="size-4 opacity-50" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        id={listId}
        className="max-h-64 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {filtered.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No matching times</p>
        ) : (
          filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(event) => {
                event.preventDefault()
                onCommit(option.value)
                setDraft(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}
```

Use `onMouseDown` + `preventDefault` on options and the chevron so the input does not blur before the click is handled.

`PopoverTrigger` must wrap a control that can toggle `open`. If the list does not open from the chevron because the trigger is not associated with the input width, wrap the whole `relative` div with `PopoverAnchor` and keep the chevron as `PopoverTrigger`. Prefer: Anchor the content to the full field:

Replace the outer structure if the popover width is wrong:

- `PopoverAnchor` on the `relative` wrapper
- `PopoverTrigger` remains the chevron

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS (no errors in the new files). If Popover exports do not match (`Root` vs namespace), follow `src/components/ui/select.tsx`: `PopoverPrimitive.Root`, `.Trigger`, `.Portal`, `.Content`, `.Anchor`.

- [ ] **Step 4: Commit** (skip unless the user asked)

```bash
git add src/components/ui/popover.tsx src/components/time-block/TimeCombobox.tsx
git commit -m "$(cat <<'EOF'
Add a typeable 15-minute time combobox on Radix Popover.

EOF
)"
```

---

### Task 3: Wire Start and End in the add/edit modal

**Files:**
- Modify: `src/components/time-block/AddTimeBlockModal.tsx`

**Interfaces:**
- Consumes: `TimeCombobox`; `startTimeOptions`, `endTimeOptions`, `shiftEndPreservingDuration`, `endAfterDuration`, `isEndAfterStart`, `canonicalTime` from `~/lib/timeInput`
- Produces: Modal state `startTime` + `endTime` (`HH:MM`); submit uses `msFromDateAndTime` for both; duration minutes field removed

- [ ] **Step 1: Replace duration state with end time**

Keep existing `msFromDateAndTime` / `timeFromMs`.

- Remove `durationMinutes` state.
- Add `endTime` state, default `'10:00'`.
- In the `open` effect:
  - Edit: `setStartTime(timeFromMs(block.start, key))`, `setEndTime(timeFromMs(block.end, key))`.
  - Add with `defaultStart`: `const start = timeFromMs(...)`, `setStartTime(start)`, `setEndTime(endAfterDuration(start, 60))`.
  - Add without `defaultStart`: `09:00` / `10:00`.

- [ ] **Step 2: Commit handlers and submit**

```ts
const handleStartCommit = (next: string) => {
  const nextEnd = shiftEndPreservingDuration({
    previousStart: startTime,
    previousEnd: endTime,
    nextStart: next,
  })
  setStartTime(next)
  setEndTime(nextEnd)
}

const handleEndCommit = (next: string) => {
  setEndTime(next)
}
```

In `handleSubmit`, after intent/task checks:

```ts
const startCanonical = canonicalTime(startTime)
const endCanonical = canonicalTime(endTime)
if (
  startCanonical == null ||
  endCanonical == null ||
  !isEndAfterStart(startCanonical, endCanonical)
) {
  setError('Enter a valid start and end time. End must be after start.')
  setPending(false)
  return
}

const start = msFromDateAndTime(dateKey, startCanonical)
const end = msFromDateAndTime(dateKey, endCanonical)
```

Do not compute `end` from duration. Keep create/update payloads the same (`title`, `start`, `end`, `taskId`).

- [ ] **Step 3: Replace the Start / Duration grid**

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="block-start">Start</Label>
    <TimeCombobox
      id="block-start"
      value={startTime}
      onCommit={handleStartCommit}
      options={startTimeOptions()}
    />
  </div>
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="block-end">End</Label>
    <TimeCombobox
      id="block-end"
      value={endTime}
      onCommit={handleEndCommit}
      options={endTimeOptions(startTime)}
    />
  </div>
</div>
```

Memoize options if you want: `useMemo(() => startTimeOptions(), [])` and `useMemo(() => endTimeOptions(startTime), [startTime])`. End options must use the **committed** `startTime`, not a draft inside the Start combobox.

Remove the duration number `Input`.

- [ ] **Step 4: Run helper tests and typecheck**

Run: `npx vitest run src/lib/timeInput.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Manual verification**

On Today and Calendar (and Backlog add block if you use it):

1. Empty-click ~14:00 → Start `14:00` (or 14:15 snap from grid), End one hour later (or `23:59` if late).
2. Open End list: labels like `15:00 (1 hr)`.
3. Type Start `09:07`, blur → End `10:07` if previous duration was 60 minutes.
4. Change Start via list from `09:00`/`10:00` to `11:00` → End `12:00`.
5. Type garbage, blur → field reverts; Save still uses last canonical pair.
6. Set End equal to Start (or Start `23:59`) → Save shows `Enter a valid start and end time. End must be after start.`
7. Pencil edit still prefills exact `block.start` / `block.end`.

- [ ] **Step 6: Commit** (skip unless the user asked)

```bash
git add src/components/time-block/AddTimeBlockModal.tsx
git commit -m "$(cat <<'EOF'
Replace block duration with Start and End time comboboxes.

EOF
)"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| Parse/format, reject AM/PM and bad times | Task 1 |
| 15-minute Start list `00:00`–`23:45` | Task 1 + 3 |
| End list after start, includes `23:59`, duration labels | Task 1 + 3 |
| Off-grid type kept exact | Task 1 + 2 + 3 |
| Start change preserves duration, clamp `23:59` | Task 1 + 3 |
| Combobox type + list + blur revert + Escape | Task 2 |
| Prefill add/edit/empty-click | Task 3 |
| Submit error copy | Task 3 |
| No Convex/schema change | all |
| Vitest only for pure helpers | Task 1 |
