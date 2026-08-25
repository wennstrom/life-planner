# Start/End time combobox — Design

**Date:** 2026-08-25
**Status:** Approved
**Touches:** `src/lib/timeInput.ts`, `src/lib/timeInput.test.ts`, `src/components/time-block/TimeCombobox.tsx`, `src/components/ui/popover.tsx`, `src/components/time-block/AddTimeBlockModal.tsx`

Related: [DayRail scroll + add/edit time block](./2026-08-24-dayrail-scroll-and-block-modal-design.md) (empty-click still prefills a 60-minute span).

## 1. Goal

Replace the native start-time input and duration-minutes field in add/edit time block with **Start** and **End** comboboxes: 15-minute dropdowns, typeable clock times, End options labeled with duration like Google Calendar. Changing Start keeps duration (End moves).

## 2. Decisions (locked)

| Topic | Decision |
| --- | --- |
| Fields | Start + End. Duration minutes field is removed. |
| Off-grid type | Keep exact minutes (`09:07` stays `09:07`). Dropdown is 15-minute shortcuts only. |
| Validation | Must parse as a real 24-hour clock time. Invalid input does not save. |
| Start change | Preserve duration: End = Start + (previous End − previous Start), then clamp to the same calendar day. |
| End list labels | `HH:MM` plus duration in parentheses, e.g. `10:00 (1 hr)`. |
| Day bounds | Same date only. No overnight blocks. Latest End is `23:59`. |
| Min length | 1 minute. End must be strictly after Start. |
| Format | 24-hour. No AM/PM. Display canonical `HH:MM` after a successful parse. |
| Grid / Convex | Unchanged. Empty-click still snaps start to 15 minutes and uses a 60-minute default span. Chip drag/resize unchanged. |

## 3. Architecture

Convex `timeBlocks.create` / `timeBlocks.update` stay as they are (`start` / `end` ms).

```
AddTimeBlockModal
  startTime: "HH:MM" | draft
  endTime:   "HH:MM" | draft
  TimeCombobox  (start)  options = 00:00 … 23:45 step 15
  TimeCombobox  (end)    options = slots after start, labels include duration

src/lib/timeInput.ts     parse, format, slots, duration text, shift-end-on-start
```

Add a thin `src/components/ui/popover.tsx` wrapper around existing `radix-ui` Popover (same pattern as Select). `TimeCombobox` is Input + chevron + popover list. No Command palette, no new npm packages.

## 4. Parsing and validation

`parseTimeInput(raw: string): { hours: number, minutes: number } | null`

Accept (trim first):

- `H:MM` or `HH:MM` (`9:07`, `09:07`, `0:00`)
- 3 or 4 digits with no separator (`907` → 9:07, `0930` → 9:30, `000` → 0:00)

Reject:

- Empty / non-numeric junk
- Hours outside `0–23`
- Minutes outside `0–59`
- `24:00`, `9:99`, `25:00`, `9:7` (minutes must be two digits when a colon is present)
- AM/PM strings

`formatTime(hours, minutes)` always returns `HH:MM` (zero-padded).

While the field is focused, the user edits a draft string. On blur or on choosing a list row:

- Valid → store canonical `HH:MM`
- Invalid → revert the field to the last canonical value (do not silently invent a time)

Submit is blocked if either field’s current text does not parse, or End ≤ Start. Error copy: **Enter a valid start and end time. End must be after start.**

## 5. TimeCombobox

Props: `id`, `value` (`HH:MM`), `onCommit(next: string)`, `options: { value: string, label: string }[]`, `aria-label` / associated `Label`.

Behavior:

- Text input shows `value`, or the draft while typing.
- Chevron (and optionally focusing the field) opens the list.
- List filters to options whose `value` or `label` contains the draft (case-insensitive). Empty filter shows all options.
- Clicking an option commits that `value` and closes.
- Typed value that is not in the list is still valid if `parseTimeInput` succeeds (off-grid).
- Escape closes the list and reverts the draft to the last committed `HH:MM`.

Start options: `00:00`, `00:15`, … `23:45` (96 rows). Labels are just `HH:MM`.

End options: every 15-minute clock time **strictly after** current Start, through `23:45`, plus **`23:59`** as the last row when Start is before `23:59`. If Start is off-grid (`09:07`), the first 15-minute option is `09:15`. If the current End is off-grid, the input still shows it; it does not need to appear as a list row.

## 6. Duration labels (End only)

`formatDurationLabel(durationMs)` using the difference End − Start for that row:

| Duration | Label |
| --- | --- |
| &lt; 60 minutes | `N min` (`15 min`, `45 min`) |
| Exact hours | `1 hr`, `2 hr` |
| Hours + minutes | `1 hr 15 min`, `2 hr 5 min` |

End row label: `{endTime} ({durationLabel})` e.g. `10:00 (1 hr)`, `10:15 (1 hr 15 min)`, `23:59 (6 hr 59 min)` if Start is `17:00`.

End options are always computed from the last committed Start `HH:MM` (not from an in-progress invalid draft). Submit still requires both current drafts to parse and End > Start.

## 7. Moving Start keeps duration

Let `durationMs = endMs - startMs` from the last **valid** pair.

On a successful Start commit:

1. `newEndMs = newStartMs + durationMs`
2. If `newEndMs` would fall on the next calendar day, set End to `23:59` that day.
3. If after clamp End ≤ Start, leave End at `23:59` and treat the pair as invalid until the user fixes it (only possible for Start at `23:59`).

Changing End never moves Start.

Changing the date field does not change the clock strings.

## 8. Prefill

| Open path | Start | End |
| --- | --- | --- |
| Add, no `defaultStart` | `09:00` | `10:00` |
| Add, empty-click / `defaultStart` | time from that ms | start + 60 minutes, clamped to `23:59` |
| Edit `block` | `block.start` | `block.end` (same date; existing data is already same-day) |

## 9. Error handling and edge cases

- Off-grid Start (`09:07`) + 60-minute duration → End `10:07`, not snapped.
- End dropdown after `09:07` begins at `09:15`.
- Start `23:00` + 60 minutes → End `23:59` (clamp), duration shrinks; further Start moves use that new duration.
- Start list does not include `23:59`; typing `23:59` as Start cannot have a later same-day End → submit error.
- List is long (~96 items): popover scrolls; no virtualization required.
- Backlog still uses this modal; it gets Start/End as well.

## 10. Testing

Vitest only (no React Testing Library), matching the rest of this app:

- Parse: `9:07`, `09:07`, `0930`, `000`; reject `9:7`, `9:99`, `24:00`, `abc`, empty.
- Format duration: 15 min, 60 min → `1 hr`, 75 min → `1 hr 15 min`.
- 15-minute slot generation; End slots after `09:07` start at `09:15` and include `23:59`.
- Shift Start `09:00`–`10:00` to `11:00` → End `12:00`.
- Shift Start `23:00` with 60 minutes → End `23:59`.

Manual: open add/edit on Today and Calendar; pick from list; type `09:07`; change Start and confirm End and labels move; invalid type then blur reverts; End before Start cannot save.

## 11. Out of scope

- Overnight / multi-day blocks
- 12-hour AM/PM
- Changing chip drag/resize snap
- New Convex functions or schema
- React Testing Library
