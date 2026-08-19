# Today Page Redesign — Wayfinder Map

**Labels:** `wayfinder:map`
**Status:** Open

---

## Destination

A redesigned Today page where the DayRail is the command center: blocks show task context and review status at a glance, a persistent "Today's intention" field sits above the rail, the redundant task list is removed, and the day closes with a stored shutdown state — turning the page into a faithful implementation of Cal Newport's time-block planning system.

## Notes

**Domain:** Cal Newport's time-block planning. Key concepts:
- The *block* is the unit of work — not the task list.
- The *committed plan* is the rail; the backlog is capture.
- The *shutdown ritual* closes the day with intention; it is not just reviewing blocks.
- The *daily intention* (what matters today, what you're carrying) is read throughout the day.

**Skills to consult each session:** `/grilling`, `/domain-modeling`

**Standing decisions from grilling (2026-08-19):**
- Remove the "Today's Todo" task list from the Today page.
- Backlog is the capture list — no new list needed.
- DayRail is most important; make it richer.
- Today's intention = renamed, repositioned quick note (top of page, always visible).
- Shutdown gains a written end-of-day note + stored "shutdown complete" state per day.
- Shutdown complete state shows persistently until midnight ("Shut down at 5:32 PM").

## Tickets

### Frontier (unblocked, open)
- [004 — Remove the Today's Todo task list](./004-remove-task-list.md) — `task`
- [005 — Today page layout composition](./005-today-page-layout.md) — `prototype`

## Decisions so far

- [001 — DayRail block display: task tag + review status](./001-dayrail-block-richness.md) — colored left border (green/yellow/red) for review status; task name as subtitle on blocks ≥30min; "Review" button on past unreviewed task blocks.
- [002 — Today's intention field](./002-todays-intention.md) — multi-line textarea, "Today's intention" label, auto-save on blur, per-day via `dayRecords.intention`, compact section above rail.
- [003 — Shutdown ceremony: written close + per-day state](./003-shutdown-ceremony.md) — new `dayRecords` table; two-step modal (review queue → close note); banner until midnight; shutdown always available in header; not a lock after close.

## Not yet specified

- Whether "plan revision" (Newport's mid-day replanning) needs an explicit affordance.
- Stats strip on Today page (blocks planned / reviewed / need review) — in mockup but not yet ticketed.
- Migration path for existing global quick note → first `dayRecords` row.

## Out of scope

<!-- populated if something is explicitly ruled out -->
