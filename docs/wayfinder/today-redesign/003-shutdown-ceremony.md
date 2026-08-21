# Ticket 003 — Shutdown ceremony: written close + per-day state

**Labels:** `wayfinder:grilling`
**Status:** Closed
**Parent map:** [Today Page Redesign](./MAP.md)

---

## Question

Shutdown gains two things: a written end-of-day note and a stored "shutdown complete" state per day. Before designing this, settle:

1. **Data model**: where does the per-day shutdown record live? Options: (a) embed it in the existing `today` record alongside the quick note, (b) a new field on a `days` table, (c) store it on the `today` document that `today.get` already returns. What fields does it carry — `completedAt`, `note`, anything else?
2. **The ceremony UX**: after reviewing all blocks, the user lands on a "close the day" screen. What does it contain? A textarea for the end-of-day note, a verbal close phrase (Newport says "shutdown complete" out loud), a "Complete shutdown" button. Is there anything else?
3. **The closed-day state**: once shut down, the Today page shows "Shut down at 5:32 PM" until midnight. Does this: (a) replace the shutdown bar, (b) appear as a banner at the top of the page, (c) change the page header? And can the user re-open and add blocks after shutting down?
4. **Shutdown entry point**: currently a "Start shutdown" button appears when unreviewed blocks exist. Should shutdown also be triggerable when all blocks are already reviewed (you want to write the close note even with nothing to review)?

---

## Resolution (2026-08-19)

Confirmed via approved mockup + code review. Current quick note uses a global notes hack — no per-day record exists yet.

### 1. Data model — new `dayRecords` table

```typescript
dayRecords: defineTable({
  userId: v.id("users"),
  dateKey: v.string(),           // "YYYY-MM-DD"
  intention: v.optional(v.string()),
  shutdownCompletedAt: v.optional(v.number()),
  shutdownNote: v.optional(v.string()),
  updatedAt: v.number(),
}).index("by_user_dateKey", ["userId", "dateKey"])
```

One row per user per calendar day. `intention` replaces the quick note. `shutdownCompletedAt` + `shutdownNote` are written on ceremony completion. Re-running shutdown overwrites both (idempotent close).

`today.get` returns the day's `dayRecord` alongside tasks/blocks data.

### 2. Ceremony UX

Two-step modal flow (matches mockup):

1. **Review queue** — walk unreviewed task-linked blocks (existing `ReviewBlockModal` logic). Skippable via "Skip to close".
2. **Close the day** — textarea ("Today I finished… Tomorrow I'll start with…") + **"Shutdown complete"** button. No in-app verbal phrase — that's spoken aloud, not rendered.

### 3. Closed-day state

- **Banner** below header: green dot + "Shut down at {time}" + shutdown note if present (mockup).
- Replaces the unreviewed-blocks callout when shut down.
- **Not a lock** — user can still add blocks and edit the rail after shutting down. Banner persists until midnight (dateKey rolls over). Re-running shutdown updates the timestamp and note.

### 4. Entry point

- **"Start shutdown" always visible** in the page header (not gated on unreviewed count).
- Separate **warning callout** when unreviewed blocks exist (count + shortcut to start shutdown) — hidden once day is shut down.
