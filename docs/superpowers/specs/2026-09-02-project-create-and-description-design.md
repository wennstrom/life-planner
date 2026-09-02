# Project Create Modal and Description — Design

**Date:** 2026-09-02
**Status:** Approved (design phase)

## Purpose

Make creating a project match the rest of the app (a modal, not an inline
name field) and make project description a first-class field: captured at
create time, shown under the title on the detail page, and editable in
place.

## Non-goals

- Board view on the project detail page (deferred until custom board columns
  settle).
- Renaming a project inline.
- Changing color after create.
- Archived-projects list or archive UX changes.
- Shared “project form” used by both create and edit.
- Route/search-param modal state (`?new=1`).
- Free-form hex color input.

## Context

`/projects` creates projects with an inline name field and auto-assigns
`COLORS[projects.length % COLORS.length]` (five hex values). Cards already
show `project.description ?? 'No description yet.'`. `projects.create` and
`projects.update` already accept optional `description`; the schema field
is optional.

`/projects/$projectId` shows `{data.project.description ?? 'Project detail'}`
under the title. That fallback is not a real empty state, and the text is
not editable.

Add task already uses a page-owned `Dialog` + TanStack Form modal. Custom
board columns (plan `docs/superpowers/plans/2026-09-02-custom-board-columns.md`,
branch `cursor/custom-board-columns-plan-c334`) define an eight-color
palette and swatch UI. Project color must use that same palette and picker
pattern so the two features do not drift.

## Approach

A self-contained `AddProjectModal` rendered by the projects list (same
ownership model as `AddTaskModal`). The page holds an `open` boolean; both
**+ New project** and the dashed card set it true.

On the detail page, a small click-to-edit description under the `h1` calls
`projects.update`. No edit-project dialog.

## Architecture

No new tables. Stay on `/projects` and `/projects/$projectId`.

| Path | Role |
| --- | --- |
| `convex/lib/boardColumnColors.ts` | Shared palette: `BOARD_COLUMN_COLORS`, `BoardColumnColor`, `isBoardColumnColor`. Create this module with the same API as the custom-columns plan if that file is not already on the branch. Do not keep a second color list on the projects page. |
| `src/lib/forms/create-project.ts` | Zod: required name, optional description, required color in the palette. |
| `src/lib/project-color.ts` | `nextProjectColor(existingColors: string[]): BoardColumnColor` |
| `src/components/projects/AddProjectModal.tsx` | Name, description, color swatches. Submit → `projects.create`. |
| `src/components/projects/ProjectDescription.tsx` | Click-to-edit under the detail title. Save → `projects.update`. |
| `src/routes/_authenticated/projects/index.tsx` | Open modal; remove inline form. |
| `src/routes/_authenticated/projects/$projectId.tsx` | Replace the static description `<p>` with `ProjectDescription`. |
| `convex/projects.ts` | Validate color on create; normalize blank description to unset. |

Frontend imports the palette from `convex/lib/boardColumnColors.ts` (same as
the board-column settings dialog in that plan).

## Color

Palette (only these; no hex input):

```
#6366f1  #3b82f6  #22c55e  #eab308
#f97316  #ec4899  #a855f7  #14b8a6
```

This is identical to `BOARD_COLUMN_COLORS` in the custom-columns plan.

Swatches: round buttons, `aria-label` = the hex, `style={{ background: color }}`,
selected ring. Same interaction as board column settings.

Default when the modal opens: first palette color not used by any **active**
project (case-sensitive exact hex match). If all eight are in use, use
`#6366f1`.

`projects.create` rejects a color that fails `isBoardColumnColor` with
`Invalid project color`. Color is required; the form always has a selected
swatch.

Color is not editable on the detail page in this change. List cards and
task badges keep using `project.color`.

## Add project modal

```typescript
type AddProjectModalProps = {
  open: boolean
  onClose: () => void
  usedColors: string[]
}
```

Built on shadcn `Dialog` + `useAppForm`, matching `AddTaskModal`.

- Title: **New project**.
- Fields, in order: name (required, autofocus), description (optional
  textarea), color (eight swatches).
- Footer: Cancel (calls `onClose`) and Create (`form.SubmitButton`).
- Esc and backdrop close without creating.
- Reset to `{ name: '', description: '', color: nextProjectColor(usedColors) }`
  whenever `open` becomes true.
- Submit: trim name; omit `description` when blank after trim; pass
  `color`. On success, `onClose()`. On failure, stay open with form error
  `Could not create the project. Please try again.`
- `usedColors` comes from the list page’s active projects query so default
  color can be computed without a nested suspense query.

The dashed “New project” card and the header button both open this modal.

## Detail description

Under the project name, not in the Archive / Delete / Add task row.

| State | UI |
| --- | --- |
| Idle, has text | Muted paragraph of the saved description. Hover/focus: pointer cursor and a light background so it reads as editable. |
| Idle, empty | Muted “Add a description…” |
| Editing | Textarea, autofocus, current value. |
| Save error | Textarea stays open; inline “Could not save description.” |

Keyboard and pointer:

- Click idle text → edit.
- Enter in the textarea inserts a newline (do not save).
- Cmd/Ctrl+Enter or blur saves.
- Esc cancels, restores the last saved value, leaves edit mode.

Save rules:

- Trim. If the trimmed value equals the last saved value (treat missing
  description as `''`), do not mutate.
- Otherwise call `projects.update({ projectId, description: trimmed })`.
- Blank trim **clears** the field: the stored document must omit
  `description` (not store `""`), so list cards and detail both use the
  empty placeholder. Implementation: if trimmed is empty, `replace` the
  project document without `description`; Convex `patch` cannot unset a
  field with `undefined` (not a valid Convex value).
- Non-blank: `patch` `{ description: trimmed }`.

## Data flow

Create: modal form → `projects.create` → list query updates in place.

Detail: local edit state ← `data.project.description`. Save →
`projects.update` → `projects.get` updates; idle view shows the new text.

Auth: existing `requireUserId` on `create` / `update` / `get`. Unchanged
ownership checks.

## Errors

| Case | Behavior |
| --- | --- |
| Blank name | Field error; no mutation |
| Color not in palette | Mutation throws `Invalid project color`; form error |
| Create mutation fails (other) | Form error; modal stays open |
| Description save fails | Stay in edit mode; inline error |
| Unauthenticated | Existing `requireUserId` |

## Testing

- `createProjectSchema`: reject blank name; accept optional description;
  reject color outside the palette; accept each palette color.
- `nextProjectColor`: skip colors already used; wrap to `#6366f1` when all
  eight are used.
- `isBoardColumnColor` / palette array: same eight hex values as the
  custom-columns plan (tests live next to `boardColumnColors` if this
  change creates that file).
- `projects.create`: stores description when provided; omits it when blank;
  rejects `#ffffff` with `Invalid project color`.
- `projects.update`: sets description; clearing blank omits the field
  (`get` returns no description / `undefined`).
- No new Playwright spec unless `/projects` is already in `e2e/smoke.spec.ts`
  and the inline form would break it — then retarget the smoke to the modal.

## File-level notes

- Prettier: Convex files keep double quotes + semicolons; `src/` uses
  single quotes, no semicolons.
- Public Convex functions keep `args` validators; `create` color stays
  `v.string()` at the boundary and is narrowed with `isBoardColumnColor`
  in the handler (same pattern as column save).
- Do not change `projects.list` or task queries.
- If `convex/lib/boardColumnColors.ts` already exists from the columns
  branch, import it; do not fork the array.

## Deferred (project detail later)

Board on the project page, compact list of off-board (`backlog` / unset
column) tasks, and richer project chrome (progress, color edit, rename).
Those wait on custom board columns so this page does not bind to statuses
that are going away.
