# Ticket 005 — Today page layout composition

**Labels:** `wayfinder:prototype`
**Status:** Open (blocked by 002, 003, 004)
**Parent map:** [Today Page Redesign](./MAP.md)
**Blocked by:**
- ~~[Ticket 002](./002-todays-intention.md)~~ (resolved)
- ~~[Ticket 003](./003-shutdown-ceremony.md)~~ (resolved)
- [Ticket 004 — Remove the task list](./004-remove-task-list.md)

---

## Question

Once the individual pieces are decided, how do they compose into the final Today page layout?

The known pieces:
- **Header**: date, block count (no task count), possibly shutdown-complete state
- **Today's intention**: always visible, top of page
- **DayRail**: dominant, enriched with task tags and review status
- **Shutdown bar**: only when unreviewed blocks exist (or always, per Ticket 003)
- **Shutdown complete banner/state**: when day is closed

Questions to settle in this ticket:
1. Does the intention field sit inside the header area or as its own section between the header and the rail?
2. Does the rail go full-width, or is there a narrow sidebar (e.g. for the backlog's "plan" shortcut)?
3. Where does the "+ Add time block" button live once the two-column layout is gone?
4. On mobile, does the intention field collapse?
