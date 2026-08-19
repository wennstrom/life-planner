# Ticket 002 — Today's intention field

**Labels:** `wayfinder:grilling`
**Status:** Closed
**Parent map:** [Today Page Redesign](./MAP.md)

---

## Question

The quick note is being promoted to "Today's intention" — repositioned to the top of the page, always visible. Before designing it, settle:

1. **Single line or multi-line?** Newport's plan is typically a few sentences ("What matters today, what I'm carrying over"). Should this be a single prominent headline input or a small textarea?
2. **Label and prompt text**: "Today's intention" or something more specific like "Today's plan" or "What matters today"? Should there be placeholder text that guides the daily planning habit?
3. **Persistence**: the current quick note already persists per-day to Convex. Does the intention field work the same way, or should it be editable inline without a save gesture (auto-save on blur as today)?
4. **Visual weight**: should it feel like a heading-level input (large, prominent) or a compact annotation above the rail?

---

## Resolution (2026-08-19)

Confirmed via approved mockup (`today-page-mockup.canvas.tsx`).

1. **Multi-line textarea** — 2 rows default. Newport's plan is a few sentences, not a headline.
2. **Label:** "Today's intention" (uppercase muted section label). **Placeholder:** "What matters today? What are you carrying over?"
3. **Auto-save on blur** — same gesture as today. **Fix:** current quick note is *not* per-day (single global `__today_quick_note__` note); intention moves to a per-day record on the new `dayRecords` table (see ticket 003).
4. **Compact annotation above the rail** — not heading-sized. Small uppercase label + textarea. Always visible, not collapsible.
