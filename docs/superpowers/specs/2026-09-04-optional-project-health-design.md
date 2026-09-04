# Optional Project Health — Design

**Date:** 2026-09-04
**Status:** Approved (design phase)
**Amends:** `docs/superpowers/specs/2026-09-03-project-list-health-and-goal-design.md`

## Purpose

Health is optional. A project can have no health. **Not set** is the create
default and a first-class choice in create and the project header. Unset
health is omitted from the document. The list card does not show a health
pill when health is missing.

## Non-goals

- A stored `"notSet"` (or similar) literal, extra table, or extra field.
- Inferring health when it is missing.
- Changing goal date, color, archive, list filters, or card editability.
- Re-backfilling existing projects that already have `health: "onTrack"`.
  Those stay On track until the user changes them.

## Data model

No new tables or fields. On `projects.health`:

| State | Storage |
| --- | --- |
| On track / At risk / Off track | `"onTrack"` / `"atRisk"` / `"offTrack"` |
| Not set | field omitted (not `""`, not `null` in the document) |

Schema: `health` is `v.optional` of the same three-literal union. Convex
cannot deploy a required field over documents that omit it, and we now
intentionally omit it.

`projects.create`: if the client omits `health` or sends nothing, **do not
insert** `health`. If the client sends one of the three literals, validate
and store it. Invalid value → `Invalid project health`.

`projects.update`: optional `health` as the three literals **or** `null`.
`null` unsets the field (replace, same pattern as clearing `goalDate`).
Omitted `health` in the patch means leave it unchanged. Invalid value →
`Invalid project health`.

## Create UI

`AddProjectModal` / `create-project` schema:

- Four choices: **Not set** (default), On track, At risk, Off track.
- Form default is Not set (`health` undefined / omitted), not On track.
- Goal date, name, description, color unchanged.

## Project header

Same four controls as create. **Not set** is selected when `health` is
missing. Choosing a health value saves immediately via `projects.update`.
Choosing **Not set** saves a clear (`null`) so the field is unset.
Failed saves keep the existing header error: `Could not save health.`

## Card UI

- Health present: existing pill (dot + label) on the left of the meta row.
- Health missing: **do not render the pill**.
- Goal date unchanged (right slot, or omitted if no date).
- If both health and goal date are missing, **omit the entire meta row**
  (no empty strip).

Cards stay display-only `Link`s.

## Copy and control

- Label: `Not set`.
- Style: muted/neutral, not the emerald/amber/red health colors.
- Implementation: extend `ProjectHealthPills` to accept
  `ProjectHealth | undefined` and a **Not set** button; do not add a
  fourth stored health value.

## Testing

- Create with omitted health → document has no `health`.
- Create with explicit `atRisk` / `offTrack` / `onTrack` → stored.
- Update `health: null` unsets the field; other fields unchanged.
- Invalid health still → `Invalid project health`.
- Create form default is Not set.
- Card: no pill (and no meta row when goal is also missing) when health
  is absent; pill still shows for the three stored values.

## File-level notes

Same Prettier and Convex validator rules as the parent spec.
This change is a small amendment: schema optional, create default omit,
update can unset, pills + card handle missing health.
