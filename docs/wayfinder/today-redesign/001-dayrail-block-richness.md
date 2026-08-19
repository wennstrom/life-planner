# Ticket 001 — DayRail block display: task tag + review status

**Labels:** `wayfinder:prototype`
**Status:** Closed

## Resolution (2026-08-19)

Prototype built in canvas (`today-page-mockup.canvas.tsx`) and reviewed with user. Design confirmed:

1. **Task tag** — shown as a subtitle line inside the block chip, only when height allows (≥32px / ~30min blocks). Truncated with ellipsis. Color: `text.tertiary`.
2. **Review status** — a colored 3px left border on the chip: green = done, yellow = partial, red = missed. No border (transparent) = unreviewed/future. An outcome label text ("Done", "Partial", "Missed") also shows top-right of the chip for reviewed blocks.
3. **Needs-review affordance** — a small accent-colored "Review" button appears top-right on past unreviewed task-linked blocks, opening the review modal inline.
**Parent map:** [Today Page Redesign](./MAP.md)

---

## Question

What does a richer block chip look like in the DayRail? Specifically:

1. **Task tag**: blocks linked to a task should show the task name as a small subtitle or tag beneath the intent. What is the visual treatment — size, color, truncation behavior — at different block heights (15 min, 30 min, 60 min+)?
2. **Review status indicator**: each block should show at a glance whether it is unreviewed, done, partial, or missed. What is the indicator — a colored left border, a dot, a background tint, an icon — and how does it behave for a block currently in progress vs one that ended without review?

**This is a prototype ticket.** Build a rough version in the DayRail and react to it before locking the design.
