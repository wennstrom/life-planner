# Project List Health, Goal Date, and Cards — Design

**Date:** 2026-09-03
**Status:** Approved (design phase)

## Purpose

`/projects` is a **scan-and-pick directory**: see which projects are running,
how they are going, and when they are meant to land, then open one. Cards
should feel filled by **health + goal date + a quieter color cue**, not by
a second workspace or fake placeholder copy.

## Non-goals

- Editing health or goal date on the list card (cards are display-only).
- Inferred health from the board, overdue tasks, or leftover counts.
- Extra health/phase labels (On hold, Not started, Done). Archive remains
  the way to stop showing a project here.
- List filters or sort controls.
- Color rail, top color strip, or tinted card wash.
- Required goal date.
- Notes, milestones, or a goals system beyond one optional target-end date.
- Archived-projects list or archive-flow changes.
- Changing how the dashed New project tile works.

## Context

Today each card is a `Link`: 5px left color bar, name, description or
“No description yet.”, `N tasks · M done` from `completedAt`, and a
progress bar. With few projects and missing descriptions the grid looks
empty. The project **detail** page is the place to run work (board +
header); this spec does not duplicate that.

The project-page board spec already says list progress must use the Done
column (`boardColumns.isDone`), not `completedAt`, via a shared helper
(e.g. `src/lib/project-progress.ts`). This spec assumes that counting
rule. If that helper is not on the branch yet, add it here so list and
detail cannot drift.

## Approach

Keep the card grid and click-through. Add user-set **health** and optional
**goal date** on `projects`. Show them on the card (status-header layout)
and set them in create + the project header. Identify color with a **title
swatch**, not a bar.

## Card UI

Grid, breakpoints, and New project tile stay as they are.

Each project card, top to bottom:

1. **Meta row:** health pill on the left; goal date on the right.
   - Pills: **On track** (success), **At risk** (warning), **Off track**
     (destructive). Small filled dot + label.
   - Goal present and not past: `Goal · Sep 30` (muted).
   - Goal present and before the viewer’s calendar today: `Overdue · Aug 15`
     in destructive color, weight 600. Date-only comparison; no timezone
     conversion beyond the `YYYY-MM-DD` string vs local today.
   - No goal date: render nothing in that slot (no “No goal” text).
2. **Title row:** 12px rounded square (`border-radius: 4px`) filled with
   `project.color`, then the name. No left rail, top strip, or wash.
3. **Description:** existing text, two-line clamp. If missing or blank,
   omit the element. Do not show “No description yet.”
4. **Footer:** `N leftover · M done` and the existing progress bar.
   - **Done** = non-archived task in this project whose `columnId` is the
     Done column.
   - **Leftover** = every other non-archived task in this project
     (including unassigned / stale column).
   - Bar = `round(done / total * 100)` with `total = leftover + done`;
     `0` when `total === 0`.

The whole card remains one `Link` to `/projects/$projectId`. Health and
date are not interactive on the list.

## Data model

No new tables. On `projects`:

| Field | Type | Rules |
| --- | --- | --- |
| `health` | `"onTrack" \| "atRisk" \| "offTrack"` | Required. Default **onTrack** on create. |
| `goalDate` | optional string | Calendar day `YYYY-MM-DD`, same convention as task `dueDate`. Omit when unset. |

`status` (`active` \| `archived`) is unchanged and is **not** health.

Existing documents must be backfilled: set `health: "onTrack"` where
missing before (or as part of) making the field required. Do not invent
goal dates.

Overdue is **not** stored. The client derives it from `goalDate` and
today. Health never auto-updates when a date passes.

## Create

`AddProjectModal` / `create-project` schema:

- Health: three options, default On track. Required.
- Goal date: optional date input. Empty → omit `goalDate`.
- Name, description, color unchanged.

`projects.create` accepts `health` (validate the three literals) and
optional `goalDate`. If the client omits `health`, insert `"onTrack"`.
Reject a `goalDate` that is not a `YYYY-MM-DD` calendar date
(`Invalid goal date`).

## Project header

List cards are read-only; the source of edits is `/projects/$projectId`
(and create).

- **Health:** three controls (same labels/colors as the pills). Changing
  selection saves immediately via `projects.update`. Invalid value →
  `Invalid project health`.
- **Goal date:** optional, clearable. Save via `projects.update`. Empty
  clear unsets the field (same “blank means remove” pattern as
  description). Invalid date → `Invalid goal date`.
- Failed saves stay on the page with a short error (same tone as other
  header edits / `Could not create the project. Please try again.`).

`projects.update` args gain optional `health` and `goalDate`. Clearing
goal date must actually unset the field (patch/replace), not store `""`.

`projects.list` and `projects.get` return the new fields. No extra list
query; the page can keep loading tasks (and `boardColumns.list`) for
progress.

## Architecture

| Path | Role |
| --- | --- |
| `convex/schema.ts` | `health`, optional `goalDate` on `projects`. |
| `convex/projects.ts` | Validate on create/update; default health; unset goal date. |
| Backfill | Existing projects → `onTrack`. |
| `src/lib/forms/create-project.ts` | Zod: health enum default onTrack; optional goal date. |
| `src/lib/project-health.ts` | Literals, labels, pill classes; `isGoalOverdue(goalDate, today)`. |
| `src/lib/project-progress.ts` | Leftover/done/percent (Done column). Shared with detail if not already. |
| `src/components/projects/AddProjectModal.tsx` | Health + goal date fields. |
| `src/routes/_authenticated/projects/index.tsx` | New card layout; omit empty description; swatch not rail. Small `ProjectCard` extract is fine if the map is noisy. |
| Project header | Health control + goal date on `$projectId`. |

Reuse existing date input patterns from task forms where they already
parse `YYYY-MM-DD`. Do not use `Date.now()` inside Convex queries for
overdue.

Frontend may import health literals from a `src/lib` module; Convex
validators stay in `convex/projects.ts` (duplicate the three literals
there, or share a tiny `convex/lib/projectHealth.ts` if that matches
how board colors are shared).

## Error handling

- Unauthenticated / wrong owner: existing `Project not found` /
  `requireUserId`.
- Bad health or goal date: throw the specific messages above; modal and
  header show them or the generic mutation fallback.
- Backfill is additive; do not rewrite names, colors, or descriptions.

## Testing

- Create: omitted health → `onTrack`; explicit atRisk/offTrack stored;
  omitted goal date omitted; invalid goal date rejected; valid date stored.
- Update: health change; set and clear `goalDate`; invalid values rejected;
  other fields unchanged.
- Backfill / schema: documents without health are not left invalid.
- `isGoalOverdue`: missing date false; today false; yesterday true;
  tomorrow false (date-only).
- Progress helper: Done column, not `completedAt`; unassigned is leftover.
- UI (component or route tests if they already exist for this page):
  empty description omitted; overdue label vs Goal label; swatch uses
  `project.color`.

No new Playwright spec unless an existing smoke test asserts the old
left rail or “No description yet.”

## File-level notes

- Prettier: Convex files keep double quotes + semicolons; `src/` uses
  single quotes, no semicolons.
- Public Convex functions keep `args` and `returns` validators.
- YAGNI: no list filters, no card dropdowns, no second progress metric.
