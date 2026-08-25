# TanStack Form + Zod + shadcn — Design

**Date:** 2026-08-21
**Status:** Approved

## Purpose

Replace hand-rolled `useState` + `onSubmit` forms with **TanStack Form** for
state, **Zod** for validation, and **shadcn** for field layout and controls.
Convex mutations, dialog chrome, and visual design stay the same.

## Problem

Six submit forms each keep their own field state, trim/required checks, pending
flags, and error strings. Inputs already come from shadcn (`Input`, `Textarea`,
`Select`, `Checkbox`, `Label`, `Button`, `Dialog`); there is no form library,
no Zod, and no shared field wrapper. Validation is easy to skip and error UI
is inconsistent (HTML `required` vs silent early-return vs inline mutation
errors).

## Decisions (from brainstorming)

- **Scope:** submit forms only. Notes search/live-save, today’s intention
  autosave-on-blur, project-delete radios, and backlog/table filters stay as
  they are.
- **Approach:** shared `createFormHook` + shadcn-backed field kit. Each screen
  owns a Zod schema and calls `useAppForm`. Independent per-form `useForm`
  wiring and a one-off `<FormField>` wrapper were rejected as duplication.
- **Validation timing:** on submit, not on every keystroke.
- **Schema vs mutation:** Zod validates the **form shape**. Submit handlers
  still map empty strings → `undefined`/`null`, hours → minutes, date+time →
  ms. Convex function signatures do not change.

## Current forms in scope

| File | Role |
|------|------|
| `src/components/tasks/AddTaskModal.tsx` | Create task |
| `src/components/tasks/EditTaskModal.tsx` | Edit task (delete confirm stays local UI) |
| `src/components/time-block/AddTimeBlockModal.tsx` | Create time block, optional inline new task |
| `src/components/time-block/ReviewBlockModal.tsx` | Review a block |
| `src/routes/_authenticated/projects/index.tsx` | Inline create project |
| `src/routes/_authenticated/today.tsx` | Shutdown-note dialog only |

Out of scope: `src/routes/_authenticated/notes.tsx`, today’s intention
textarea, `src/components/projects/ProjectDeleteDialog.tsx`,
`src/routes/_authenticated/backlog.tsx`, `src/components/tasks/BacklogTasksTable.tsx`.

## Architecture

```
src/components/form/form-contexts.ts   createFormHookContexts
src/components/form/form-hook.ts       createFormHook → useAppForm, withForm
src/components/form/fields.tsx         shadcn-backed field components
src/components/ui/field.tsx            shadcn Field / FieldLabel / FieldError
src/lib/forms/add-task.ts              Zod schema + inferred values type
src/lib/forms/edit-task.ts
src/lib/forms/add-time-block.ts
src/lib/forms/review-block.ts
src/lib/forms/create-project.ts
src/lib/forms/shutdown-note.ts
```

### Libraries

- `@tanstack/react-form` — form state, field API, submit
- `zod` v4 — Standard Schema; pass the schema as `validators.onSubmit`
- shadcn **Field** (`npx shadcn add field`) — label, error, `aria-invalid`
  layout
- Existing shadcn controls — `Input`, `Textarea`, `Select`, `Checkbox`,
  `Button`, `Dialog`

Do not add react-hook-form or the old shadcn `Form` (RHF) primitive.

### Form hook

`createFormHook` registers field components and a submit button. Screens use
`useAppForm`, not raw `useForm`.

```typescript
const form = useAppForm({
  defaultValues,
  validators: { onSubmit: schema },
  onSubmit: async ({ value }) => {
    try {
      await mutation(mapToArgs(value))
      onSuccess()
    } catch {
      form.setErrorMap({ onSubmit: { form: mutationErrorMessage } })
    }
  },
})
```

`SubmitButton` disables while `form.state.isSubmitting`. There is no local
`pending` flag for form submit.

### Field kit

| Component | Wraps | Notes |
|-----------|-------|--------|
| `TextField` | `Input` | `type` prop: `text` (default), `date`, `time`, `number` |
| `TextareaField` | `Textarea` | |
| `SelectField` | `Select` | Maps schema `""` ↔ Select value `"none"` internally |
| `CheckboxField` | `Checkbox` | |
| `SubmitButton` | `Button` | `type="submit"`, disabled while submitting |

Each field renders shadcn `Field` + `FieldLabel` + control + `FieldError` from
`field.state.meta.errors`. Controls set `aria-invalid` when the field has an
error.

`SelectField` never puts `"none"` in form values. Schema and Convex mapping
see `""` or a real id.

Date/time/number stay as `TextField` with `type`. Number fields that allow
empty (edit-task estimate) keep a **string** value so blank is representable.
Number fields that always have a value (duration, actual minutes) use
`z.number()`.

### Dialog reset

When a dialog opens, call `form.reset(defaultValues)` instead of clearing
many `useState`s.

| Form | Reset source |
|------|----------------|
| Add task | empty fields; `projectId` from `defaultProjectId` |
| Edit task | current `task` (estimate hours = minutes / 60 as string) |
| Add time block | props defaults; duration `60`; `creatingTask` false |
| Review block | outcome `done`; actual minutes from block length; other fields empty/false |
| Shutdown note | `data.dayRecord?.shutdownNote ?? ''` |

Reset must not submit. Closing without save discards in-progress values
(same as today).

### Form-level errors

Zod issues render under the field. Mutation failures render once above the
footer as `text-sm text-destructive`, matching current copy:

- Add task: `Could not create the task. Please try again.`
- Edit task: `Could not save the task. Please try again.`
- Add time block: `Could not create the time block. Please try again.`
- Review block: `Could not save the review. Please try again.`
- Shutdown note: `Could not complete shutdown. Please try again.`
- Create project: `Could not create the project. Please try again.` (new;
  create is silent on failure today)

## Schemas

### Add task — `src/lib/forms/add-task.ts`

```typescript
{
  title: z.string().trim().min(1, 'Title is required'),
  notes: z.string(),
  projectId: z.string(), // "" = no project
  dueDate: z.string(),   // "" or YYYY-MM-DD
}
```

Submit maps `notes` / `projectId` / `dueDate` empty → `undefined`. Cast
non-empty `projectId` to `Id<'projects'>`.

### Edit task — `src/lib/forms/edit-task.ts`

```typescript
{
  title: z.string().trim().min(1, 'Title is required'),
  notes: z.string(),
  status: z.enum(['backlog', 'in-progress', 'review', 'test', 'investigate', 'done']),
  projectId: z.string(),
  estimateHours: z.string().refine(
    (s) => s === '' || (!Number.isNaN(Number(s)) && Number(s) >= 0),
    'Enter a number 0 or greater',
  ),
  dueDate: z.string(),
  priority: z.enum(['', '1', '2', '3']),
}
```

Submit maps empty notes/project/dueDate/priority → `null`; estimate string →
`Math.round(Number(estimateHours) * 60)` or `null`. Delete confirm remains
component state (`confirmingDelete`), not a form field.

### Add time block — `src/lib/forms/add-time-block.ts`

```typescript
{
  taskId: z.string(),        // "" = personal block
  creatingTask: z.boolean(),
  newTaskTitle: z.string(),
  intent: z.string().trim().min(1, 'Intent is required'),
  dateKey: z.string().min(1),
  startTime: z.string().min(1),
  durationMinutes: z.number().min(15, 'Duration must be at least 15 minutes'),
}
```

`superRefine`: if `creatingTask`, `newTaskTitle.trim()` must be non-empty
(`Enter a title for the new task.`). Submit: if `creatingTask`, call
`tasks.create` then `timeBlocks.create`; otherwise create the block with
`taskId` or omit it. Date+time → start ms; end = start + duration minutes.

Select UI still uses `__create_task__` as a trigger; that value is not stored
in the schema. Choosing it sets `creatingTask: true` and `taskId: ""`.

### Review block — `src/lib/forms/review-block.ts`

```typescript
{
  outcome: z.enum(['done', 'partial', 'missed']),
  actualMinutes: z.number().min(1),
  focus: z.enum(['', 'deep', 'shallow', 'interrupted']),
  note: z.string(),
  nextStep: z.string(),
  scheduleNext: z.boolean(),
  blocked: z.boolean(),
  blockedReason: z.string(),
}
```

`blockedReason` is optional even when `blocked` is true (current behavior).
Submit omits empty optional strings and sends `scheduleNext` only when true.
The “Schedule it now” checkbox stays disabled when `nextStep` is blank or the
block has no `taskId`.

Outcome remains the existing three-button toggle, bound through the form
field API. Do not add a RadioGroup.

### Create project — `src/lib/forms/create-project.ts`

```typescript
{
  name: z.string().trim().min(1, 'Name is required'),
}
```

Color is still assigned as `COLORS[projects.length % COLORS.length]`, not a
form field.

### Shutdown note — `src/lib/forms/shutdown-note.ts`

```typescript
{
  note: z.string(),
}
```

Submit calls `today.completeShutdown({ note: value.note.trim(), dateKey })`.

## Screen changes

Each in-scope component:

1. Drop per-field `useState` and `handleSubmit`.
2. Keep Convex `useMutation` / `useQuery` and dialog/page chrome.
3. Render `form.AppForm` wrapping a native `<form>` that calls
   `preventDefault` + `form.handleSubmit()` on submit, then `form.AppField`
   per field and `SubmitButton`.
4. Preserve labels, placeholders, autofocus, `lockProject`, dialog widths,
   and button copy.

Create-project stays an inline row on the projects page, not a modal.
Shutdown note stays inside the existing “Close the day” dialog on Today.

## Migration order

1. Install `@tanstack/react-form` and `zod`; add shadcn `Field`.
2. Add form contexts, hook, and field kit.
3. Add-task modal (the template).
4. Edit-task, add-time-block, review-block.
5. Create-project inline form and shutdown-note dialog.

Each step leaves the app usable. No Convex schema or mutation signature
changes.

## Testing

- Unit-test Zod schemas for required/optional/conditional cases (add-task
  empty title; add-time-block new-task title only required when
  `creatingTask`; estimateHours empty vs invalid).
- Existing Playwright smoke test stays the sign-in path; no e2e expansion
  required for this refactor.
- `tsc --noEmit` must pass.

## Risks

- **`"none"` leaking into Zod** — `SelectField` is the only place that maps
  `"none"` ↔ `""`. Schemas and mutations never see `"none"`.
- **Create-task branch** — `creatingTask` + `superRefine` must keep the extra
  title field required only in that mode.
- **Dialog reset** — `form.reset` on open must not trigger submit; unmount
  while submitting should not double-submit (TanStack Form `isSubmitting`
  already gates the button).
- **Always-mounted modals** — add/edit task modals stay mounted; continue to
  use non-suspense `useQuery` for projects/tasks so the page does not
  suspend.

## Non-goals

- Autosave editors (notes, today’s intention)
- Confirmation dialogs that are not data-entry forms
- Filters and table cell selects
- Changing Convex validators or API args
- react-hook-form
