# Time block chip layout + delete in modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin Review in a chip footer so short blocks stay actionable, and move time-block delete into the edit modal with the same inline confirm pattern as Edit task.

**Architecture:** `TimeBlockChip` becomes a flex column (header → body → optional sticky footer). Footer mounts only when Review is needed. Delete leaves the chip; `AddTimeBlockModal` owns `timeBlocks.remove` with ghost Delete → confirm. Today/Calendar drop `blockToDelete` + `ConfirmDialog`. `isBlockControl` stops matching the deleted chip control.

**Tech Stack:** React 19, TypeScript, existing Convex `api.timeBlocks.remove`, Vitest for pure helpers only, lucide-react (Trash2 removed from chip).

## Global Constraints

- Do not add npm packages or React Testing Library / jsdom.
- Do not change Convex schema, `blockNeedsReview`, tones, borders, or calendar geometry (`HOUR_HEIGHT`, etc.).
- No empty footer strip. Google badge stays in the **header**, never as a footer trigger.
- Review is always visible when needed (no hover opacity gate). Footer content aligns start so it does not cover the resize handle.
- Delete copy: “Delete this time block?” / Delete / Keep. Error: `Could not delete the time block. Please try again.`
- Import DOM/React event types from `'react'`, not the `React.*` namespace.
- Commit only when the user asked to commit. If they have not, skip every Commit step.
- Spec: `docs/superpowers/specs/2026-08-25-timeblock-chip-layout-design.md`

## File structure

| File | Responsibility |
|---|---|
| `src/lib/timeBlockAppearance.ts` | `isBlockControl` matches Review only |
| `src/lib/timeBlockAppearance.test.ts` | Vitest for `isBlockControl` |
| `src/components/time-block/AddTimeBlockModal.tsx` | Edit-mode inline delete + `timeBlocks.remove` |
| `src/components/calendar/TimeBlockChip.tsx` | Header / body / optional Review footer; no delete |
| `src/components/calendar/DayRail.tsx` | Drop `onRemoveBlock` |
| `src/components/calendar/WeekView.tsx` | Drop `onRemoveBlock` |
| `src/routes/_authenticated/today.tsx` | Drop chip delete + ConfirmDialog |
| `src/routes/_authenticated/calendar.tsx` | Drop chip delete + ConfirmDialog |

Out of scope: new chip colors/typography, height-tiered alternate layouts, always-on empty footer, moving Review into the modal, keyboard-only delete.

---

### Task 1: `isBlockControl` drops delete

**Files:**
- Modify: `src/lib/timeBlockAppearance.ts`
- Modify: `src/lib/timeBlockAppearance.test.ts`

**Interfaces:**
- Consumes: existing `isBlockControl(target: EventTarget | null): boolean`
- Produces: same signature; matches only `[data-review-button="true"]` (no `[data-delete-button="true"]`)

- [x] **Step 1: Write the failing tests**

Add to `src/lib/timeBlockAppearance.test.ts` imports: `isBlockControl`.

Append:

```ts
describe('isBlockControl', () => {
  it('matches the Review button', () => {
    const button = document.createElement('button')
    button.setAttribute('data-review-button', 'true')
    expect(isBlockControl(button)).toBe(true)
  })

  it('does not match a delete button', () => {
    const button = document.createElement('button')
    button.setAttribute('data-delete-button', 'true')
    expect(isBlockControl(button)).toBe(false)
  })

  it('does not match arbitrary elements', () => {
    expect(isBlockControl(document.createElement('div'))).toBe(false)
    expect(isBlockControl(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timeBlockAppearance.test.ts`

Expected: FAIL — `isBlockControl` still returns `true` for `data-delete-button`.

- [ ] **Step 3: Update `isBlockControl`**

In `src/lib/timeBlockAppearance.ts`, change the selector to Review only:

```ts
export function isBlockControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('[data-review-button="true"]'))
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/timeBlockAppearance.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/lib/timeBlockAppearance.ts src/lib/timeBlockAppearance.test.ts
git commit -m "$(cat <<'EOF'
fix: stop treating chip delete as a drag control

EOF
)"
```

---

### Task 2: Edit modal inline delete

**Files:**
- Modify: `src/components/time-block/AddTimeBlockModal.tsx`

**Interfaces:**
- Consumes: existing `block?: Doc<'timeBlocks'> | null`, `onClose`, `api.timeBlocks.remove`
- Produces: edit-mode footer with Delete → “Delete this time block?” / Delete / Keep; confirm calls `remove({ blockId })` then `onClose`; add mode unchanged (no Delete)

- [ ] **Step 1: Add remove mutation + confirm state**

Near the other mutations / state in `AddTimeBlockModal`:

```ts
const removeBlock = useMutation(api.timeBlocks.remove)
// ...
const [confirmingDelete, setConfirmingDelete] = useState(false)
```

In the existing `useEffect` that resets form state when `open` / `block` / defaults change, also reset confirm:

```ts
setConfirmingDelete(false)
```

(place with the other `setError(null)` / `setPending(false)` resets so closing or reopening clears confirm).

- [ ] **Step 2: Add `handleDelete`**

After `handleSubmit`:

```ts
const handleDelete = async () => {
  if (!block || pending) return
  setPending(true)
  setError(null)
  try {
    await removeBlock({ blockId: block._id })
    onClose()
  } catch {
    setError('Could not delete the time block. Please try again.')
    setPending(false)
  }
}
```

- [ ] **Step 3: Replace the footer with Edit-task-style layout**

Replace the current `DialogFooter` (Cancel + Save only) with a footer that mirrors `EditTaskModal`: left Delete/confirm when editing; right Cancel + submit. Keep using `DialogFooter` with `className` override so left/right split works:

```tsx
{error ? <p className="text-sm text-destructive">{error}</p> : null}

<DialogFooter className="sm:justify-between">
  {editing ? (
    confirmingDelete ? (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Delete this time block?</span>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void handleDelete()}
          disabled={pending}
        >
          Delete
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmingDelete(false)}
        >
          Keep
        </Button>
      </div>
    ) : (
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirmingDelete(true)}
      >
        Delete
      </Button>
    )
  ) : (
    <span />
  )}
  <div className="flex items-center gap-2">
    <Button type="button" variant="outline" onClick={onClose}>
      Cancel
    </Button>
    <Button type="submit" disabled={pending}>
      {editing ? 'Save' : 'Add block'}
    </Button>
  </div>
</DialogFooter>
```

Notes:
- Add mode must not show Delete (`editing` gate).
- Empty `<span />` on the left in add mode keeps Cancel/Save on the right under `sm:justify-between`.
- Do not require new props from pages; `block` already marks edit mode.

- [ ] **Step 4: Manual check**

1. Open an existing block → Edit time block → Delete appears left; Cancel + Save right.
2. Delete → “Delete this time block?” with Delete / Keep; Keep returns to ghost Delete.
3. Confirm Delete removes the block and closes the modal.
4. Add flow (+ New block / empty slot) has no Delete control.
5. Force a failure (optional: temporary bad `blockId` or offline) → error copy `Could not delete the time block. Please try again.`

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/components/time-block/AddTimeBlockModal.tsx
git commit -m "$(cat <<'EOF'
feat: delete time blocks from the edit modal

EOF
)"
```

---

### Task 3: Chip header / body / Review footer

**Files:**
- Modify: `src/components/calendar/TimeBlockChip.tsx`

**Interfaces:**
- Consumes: existing props except `onRemoveBlock` (removed this task or next — prefer remove here and update call sites in Task 4 in the same PR; for this task, stop using `onRemoveBlock` and remove it from the props type so Task 4 fixes call sites)
- Produces: flex column chip; footer only when `needsReview && onReviewBlock`; Google badge in header; no delete button

- [ ] **Step 1: Rewrite `TimeBlockChip`**

Replace `src/components/calendar/TimeBlockChip.tsx` with:

```tsx
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
  onEditBlock: (block: Doc<'timeBlocks'>) => void
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
  onEditBlock,
}: TimeBlockChipProps) {
  const drag = useBlockPointerDrag({
    top,
    height,
    dayStartMs,
    durationMs: block.end - block.start,
    onCommit: (patch) => onUpdateBlock(block._id, patch),
    onActivate: () => onEditBlock(block),
  })

  const reviewOutcome = block.review?.outcome
  const showFooter = Boolean(showReview && onReviewBlock)
  const showTaskSubtitle =
    Boolean(taskTitle) && drag.displayedHeight >= SUBTITLE_MIN_HEIGHT
  const showOutcomeLabel =
    Boolean(reviewOutcome) && drag.displayedHeight >= SUBTITLE_MIN_HEIGHT

  return (
    <div
      data-time-block-chip="true"
      className={cn(
        'absolute inset-x-2 flex touch-none select-none flex-col overflow-hidden rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-white',
        blockToneClass(block),
        reviewBorderClass(reviewOutcome),
      )}
      style={{
        top: drag.displayedTop,
        height: drag.displayedHeight,
        cursor: drag.resizing
          ? 'ns-resize'
          : drag.dragging
            ? 'grabbing'
            : 'pointer',
      }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex shrink-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate">{block.title}</div>
          </div>
          {block.origin === 'google' ? (
            <span className="shrink-0 rounded border border-white/50 px-1 py-0.5 text-[10px] opacity-85">
              Google
            </span>
          ) : null}
          {showOutcomeLabel && reviewOutcome ? (
            <span className="shrink-0 text-[10px] font-semibold text-white/90">
              {reviewOutcomeLabel(reviewOutcome)}
            </span>
          ) : null}
        </div>
        {showTaskSubtitle ? (
          <div className="min-h-0 truncate text-[10px] font-normal text-white/80">
            {taskTitle}
          </div>
        ) : null}
      </div>

      {showFooter ? (
        <div className="mt-0.5 flex shrink-0 items-center justify-start pr-4">
          <button
            type="button"
            data-review-button="true"
            className="rounded bg-white/30 px-1 py-0.5 text-[10px] font-semibold hover:bg-white/50"
            onClick={(event) => {
              event.stopPropagation()
              onReviewBlock?.(block)
            }}
          >
            Review
          </button>
        </div>
      ) : null}

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

Layout rules encoded above:
- Outer: full height, `overflow-hidden`, `flex flex-col`.
- Header + body in `flex-1 min-h-0` so they clip first.
- Footer `shrink-0` only when Review is needed; `pr-4` / `justify-start` keeps clear of the resize handle.
- No `group-hover` delete; no `Trash2` import; no `onRemoveBlock`.
- Google badge in header row; outcome still height-gated with `SUBTITLE_MIN_HEIGHT`.

- [ ] **Step 2: Typecheck call sites (expect errors until Task 4)**

Run: `npx tsc --noEmit`

Expected: errors on `DayRail` / `WeekView` / pages still passing `onRemoveBlock` to `TimeBlockChip` / requiring the prop. Fix in Task 4 immediately after (same session).

If you prefer zero red intermediate state, do Task 3 and Task 4 as one continuous change before typechecking.

- [ ] **Step 3: Commit** (only if the user asked; prefer committing with Task 4)

```bash
git add src/components/calendar/TimeBlockChip.tsx
git commit -m "$(cat <<'EOF'
feat: pin Review in the time block chip footer

EOF
)"
```

---

### Task 4: Drop chip delete plumbing from rails and pages

**Files:**
- Modify: `src/components/calendar/DayRail.tsx`
- Modify: `src/components/calendar/WeekView.tsx`
- Modify: `src/routes/_authenticated/today.tsx`
- Modify: `src/routes/_authenticated/calendar.tsx`

**Interfaces:**
- Consumes: Task 2 modal delete; Task 3 chip without `onRemoveBlock`
- Produces: DayRail / WeekView / pages no longer accept or wire `onRemoveBlock`; pages no longer hold `blockToDelete` or render time-block `ConfirmDialog`

- [ ] **Step 1: Update `DayRail`**

Remove `onRemoveBlock` from `DayRailProps`, the destructuring list, and the `TimeBlockChip` prop:

```tsx
// DayRailProps — delete this line:
// onRemoveBlock: (block: Doc<'timeBlocks'>) => void

// TimeBlockChip call — omit onRemoveBlock:
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
  onEditBlock={onEditBlock}
/>
```

- [ ] **Step 2: Update `WeekView`**

Same removal from `WeekViewProps`, destructuring, and the `TimeBlockChip` call (omit `onRemoveBlock={onRemoveBlock}`).

- [ ] **Step 3: Update Today page**

In `src/routes/_authenticated/today.tsx`:

1. Remove `removeBlock` mutation if it is only used for the ConfirmDialog.
2. Remove `blockToDelete` state.
3. Remove `onRemoveBlock={setBlockToDelete}` from `DayRail`.
4. Remove the time-block `ConfirmDialog` block entirely.
5. Drop unused `ConfirmDialog` import.

- [ ] **Step 4: Update Calendar page**

In `src/routes/_authenticated/calendar.tsx`, same cleanup:

1. Remove `removeBlock` mutation.
2. Remove `blockToDelete` state.
3. Remove `onRemoveBlock={setBlockToDelete}` from `WeekView`.
4. Remove the time-block `ConfirmDialog`.
5. Drop unused `ConfirmDialog` import.

- [ ] **Step 5: Verify types + appearance tests**

Run:

```bash
npx tsc --noEmit
npx vitest run src/lib/timeBlockAppearance.test.ts
```

Expected: PASS / no errors.

- [ ] **Step 6: Manual checklist (Today + Calendar)**

1. Short past task-linked block: Review visible in footer without hover.
2. Tall block needing review: title header, task body, Review footer.
3. No-review app block: no footer; title (+ body when tall).
4. Google block: Google badge in header; no Review footer; tap opens edit; Delete available in modal.
5. Tap chip → Edit → Delete → confirm removes block; Keep cancels confirm.
6. Add flow: no Delete in modal.
7. Drag / resize / empty-click add unchanged; Review click does not start a drag.

- [ ] **Step 7: Commit** (only if the user asked)

```bash
git add \
  src/components/calendar/TimeBlockChip.tsx \
  src/components/calendar/DayRail.tsx \
  src/components/calendar/WeekView.tsx \
  src/routes/_authenticated/today.tsx \
  src/routes/_authenticated/calendar.tsx
git commit -m "$(cat <<'EOF'
refactor: remove chip delete; pages rely on modal

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Review in footer when needed; always visible | 3 |
| Google badge in header; no footer for Google alone | 3 |
| Footer only when `needsReview` + `onReviewBlock` | 3 |
| Body height-gated with `SUBTITLE_MIN_HEIGHT` | 3 |
| Outcome in header when tall enough | 3 |
| Delete only in edit modal; inline confirm | 2 |
| Remove page `blockToDelete` + ConfirmDialog | 4 |
| Drop `onRemoveBlock` from chip / DayRail / WeekView | 3–4 |
| `isBlockControl` drops delete | 1 |
| Drag/edit/Review `stopPropagation` unchanged | 3 (Review handler kept) |
| Vitest for `isBlockControl` | 1 |
| Manual Today/Calendar checklist | 2, 4 |
