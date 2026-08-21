# TanStack Form + Zod + shadcn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six hand-rolled submit forms with TanStack Form, Zod v4, and shadcn Field layout, without changing Convex APIs or visual design.

**Architecture:** A shared `createFormHook` (`useAppForm`) registers shadcn-backed field components. Each screen owns a Zod schema and a small mapper from form values to mutation args. Dialogs reset with `form.reset(...)` on open. Field errors come from Zod; mutation failures use `form.setErrorMap`.

**Tech Stack:** `@tanstack/react-form`, `zod` v4 (Standard Schema), shadcn Field + existing Input/Textarea/Select/Checkbox/Button/Dialog, Convex `useMutation`/`useQuery`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-tanstack-form-zod-design.md`

## Global Constraints

- Submit forms only. Do not convert notes live-save, today’s intention autosave, project-delete radios, or backlog/table filters.
- Validate on submit, not on every keystroke.
- Do not change Convex mutation/query signatures.
- Do not add react-hook-form or the old shadcn RHF `Form` primitive.
- `SelectField` is the only place that maps Select `"none"` ↔ schema `""`.
- Prettier: no semicolons, single quotes, trailing commas.
- Do not create a git commit unless the user explicitly asks for one.

## File map

| Path | Responsibility |
|------|----------------|
| `src/lib/forms/select-none.ts` | `"none"` ↔ `""` helpers |
| `src/lib/forms/add-task.ts` | Add-task schema, defaults, mapper |
| `src/lib/forms/edit-task.ts` | Edit-task schema, `valuesFromTask`, mapper |
| `src/lib/forms/add-time-block.ts` | Add-block schema, defaults, time helpers, mapper |
| `src/lib/forms/review-block.ts` | Review schema, defaults, mapper |
| `src/lib/forms/create-project.ts` | Create-project schema |
| `src/lib/forms/shutdown-note.ts` | Shutdown-note schema |
| `src/lib/forms/*.test.ts` | Schema/mapper unit tests |
| `src/components/form/form-contexts.ts` | `createFormHookContexts` |
| `src/components/form/fields.tsx` | Text/Textarea/Select/Checkbox/Submit/FormError |
| `src/components/form/form-hook.ts` | `createFormHook` → `useAppForm` |
| `src/components/ui/field.tsx` | shadcn Field primitives (CLI) |
| Existing modal/route files | Wire `useAppForm` |

---

### Task 1: Zod schemas, mappers, and tests

**Files:**
- Modify: `package.json` (add `zod`)
- Modify: `vitest.config.ts`
- Create: `src/lib/forms/select-none.ts`
- Create: `src/lib/forms/select-none.test.ts`
- Create: `src/lib/forms/add-task.ts`
- Create: `src/lib/forms/add-task.test.ts`
- Create: `src/lib/forms/edit-task.ts`
- Create: `src/lib/forms/edit-task.test.ts`
- Create: `src/lib/forms/add-time-block.ts`
- Create: `src/lib/forms/add-time-block.test.ts`
- Create: `src/lib/forms/review-block.ts`
- Create: `src/lib/forms/review-block.test.ts`
- Create: `src/lib/forms/create-project.ts`
- Create: `src/lib/forms/create-project.test.ts`
- Create: `src/lib/forms/shutdown-note.ts`
- Create: `src/lib/forms/shutdown-note.test.ts`

**Interfaces:**
- Consumes: `startOfDayMs` from `src/lib/dates.ts`
- Produces: exported schemas, value types, default factories, and `to*Args` mappers used by later tasks

- [ ] **Step 1: Write the failing tests**

Create `src/lib/forms/select-none.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { fromSelectValue, toSelectValue } from './select-none'

describe('select none mapping', () => {
  it('maps empty schema value to the Select sentinel', () => {
    expect(toSelectValue('')).toBe('none')
  })

  it('passes through real ids', () => {
    expect(toSelectValue('abc')).toBe('abc')
    expect(fromSelectValue('abc')).toBe('abc')
  })

  it('maps the Select sentinel back to empty string', () => {
    expect(fromSelectValue('none')).toBe('')
  })
})
```

Create `src/lib/forms/add-task.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { addTaskSchema, emptyAddTaskValues, toCreateTaskArgs } from './add-task'

describe('addTaskSchema', () => {
  it('rejects a blank title', () => {
    const result = addTaskSchema.safeParse(emptyAddTaskValues())
    expect(result.success).toBe(false)
  })

  it('rejects a whitespace-only title', () => {
    const result = addTaskSchema.safeParse({
      ...emptyAddTaskValues(),
      title: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional empty notes, project, and due date', () => {
    const result = addTaskSchema.safeParse({
      ...emptyAddTaskValues(),
      title: 'Buy milk',
    })
    expect(result.success).toBe(true)
  })
})

describe('toCreateTaskArgs', () => {
  it('omits empty optional fields', () => {
    expect(toCreateTaskArgs({ ...emptyAddTaskValues(), title: 'Buy milk' })).toEqual({
      title: 'Buy milk',
      notes: undefined,
      projectId: undefined,
      dueDate: undefined,
    })
  })

  it('passes through filled optional fields', () => {
    expect(
      toCreateTaskArgs({
        title: 'Buy milk',
        notes: '  2%',
        projectId: 'proj1',
        dueDate: '2026-08-21',
      }),
    ).toEqual({
      title: 'Buy milk',
      notes: '2%',
      projectId: 'proj1',
      dueDate: '2026-08-21',
    })
  })
})
```

Create `src/lib/forms/edit-task.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  editTaskSchema,
  toUpdateTaskArgs,
  valuesFromTask,
} from './edit-task'

const valid = {
  title: 'Ship it',
  notes: '',
  status: 'backlog' as const,
  projectId: '',
  estimateHours: '',
  dueDate: '',
  priority: '' as const,
}

describe('editTaskSchema', () => {
  it('accepts an empty estimate', () => {
    expect(editTaskSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a negative estimate', () => {
    expect(
      editTaskSchema.safeParse({ ...valid, estimateHours: '-1' }).success,
    ).toBe(false)
  })

  it('rejects a non-numeric estimate', () => {
    expect(
      editTaskSchema.safeParse({ ...valid, estimateHours: 'abc' }).success,
    ).toBe(false)
  })
})

describe('toUpdateTaskArgs', () => {
  it('converts hours to minutes and empty optionals to null', () => {
    expect(
      toUpdateTaskArgs({ ...valid, estimateHours: '1.5', priority: '3' }),
    ).toEqual({
      title: 'Ship it',
      notes: null,
      status: 'backlog',
      projectId: null,
      estimateMinutes: 90,
      dueDate: null,
      priority: 3,
    })
  })
})

describe('valuesFromTask', () => {
  it('converts minutes back to hours string', () => {
    expect(
      valuesFromTask({
        title: 'Ship it',
        status: 'in-progress',
        estimateMinutes: 90,
      }),
    ).toMatchObject({
      title: 'Ship it',
      status: 'in-progress',
      estimateHours: '1.5',
      priority: '',
    })
  })
})
```

Create `src/lib/forms/add-time-block.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  addTimeBlockSchema,
  emptyAddTimeBlockValues,
  toCreateBlockArgs,
} from './add-time-block'

describe('addTimeBlockSchema', () => {
  it('rejects a blank intent', () => {
    const result = addTimeBlockSchema.safeParse(emptyAddTimeBlockValues())
    expect(result.success).toBe(false)
  })

  it('does not require a new-task title unless creating', () => {
    const result = addTimeBlockSchema.safeParse({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
    })
    expect(result.success).toBe(true)
  })

  it('requires a new-task title when creatingTask is true', () => {
    const result = addTimeBlockSchema.safeParse({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
      creatingTask: true,
      newTaskTitle: '  ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'newTaskTitle')).toBe(
        true,
      )
    }
  })

  it('rejects duration under 15 minutes', () => {
    const result = addTimeBlockSchema.safeParse({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
      durationMinutes: 10,
    })
    expect(result.success).toBe(false)
  })
})

describe('toCreateBlockArgs', () => {
  it('computes end from start plus duration', () => {
    const args = toCreateBlockArgs({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
      dateKey: '2026-08-21',
      startTime: '09:00',
      durationMinutes: 60,
      taskId: 'task1',
    })
    expect(args.title).toBe('Write tests')
    expect(args.end - args.start).toBe(60 * 60000)
    expect(args.taskId).toBe('task1')
  })

  it('omits taskId when empty', () => {
    const args = toCreateBlockArgs({
      ...emptyAddTimeBlockValues(),
      intent: 'Break',
      dateKey: '2026-08-21',
      startTime: '09:00',
    })
    expect(args.taskId).toBeUndefined()
  })
})
```

Create `src/lib/forms/review-block.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  emptyReviewBlockValues,
  reviewBlockSchema,
  toReviewBlockArgs,
} from './review-block'

describe('reviewBlockSchema', () => {
  it('accepts blocked with an empty reason', () => {
    expect(
      reviewBlockSchema.safeParse({
        ...emptyReviewBlockValues(60),
        blocked: true,
        blockedReason: '',
      }).success,
    ).toBe(true)
  })

  it('rejects actualMinutes below 1', () => {
    expect(
      reviewBlockSchema.safeParse({
        ...emptyReviewBlockValues(60),
        actualMinutes: 0,
      }).success,
    ).toBe(false)
  })
})

describe('toReviewBlockArgs', () => {
  it('omits empty optionals and sends scheduleNext only when true', () => {
    expect(toReviewBlockArgs(emptyReviewBlockValues(45))).toEqual({
      outcome: 'done',
      actualMinutes: 45,
      focus: undefined,
      note: undefined,
      nextStep: undefined,
      blockedReason: undefined,
      scheduleNext: undefined,
    })
  })

  it('sends blockedReason only when blocked', () => {
    expect(
      toReviewBlockArgs({
        ...emptyReviewBlockValues(45),
        blocked: false,
        blockedReason: 'ignored',
      }).blockedReason,
    ).toBeUndefined()
  })
})
```

Create `src/lib/forms/create-project.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { createProjectSchema } from './create-project'

describe('createProjectSchema', () => {
  it('rejects a blank name', () => {
    expect(createProjectSchema.safeParse({ name: '  ' }).success).toBe(false)
  })

  it('accepts a trimmed name', () => {
    expect(createProjectSchema.safeParse({ name: 'Life planner' }).success).toBe(
      true,
    )
  })
})
```

Create `src/lib/forms/shutdown-note.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { shutdownNoteSchema } from './shutdown-note'

describe('shutdownNoteSchema', () => {
  it('accepts an empty note', () => {
    expect(shutdownNoteSchema.safeParse({ note: '' }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/forms
```

Expected: FAIL with cannot-find-module / failed to resolve `./select-none` (and the other schema files).

- [ ] **Step 3: Install zod and include src tests in Vitest**

```bash
npm install zod
```

Replace `vitest.config.ts` with:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts', 'src/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
})
```

- [ ] **Step 4: Write the implementations**

`src/lib/forms/select-none.ts`:

```typescript
export const SELECT_NONE = 'none'

export function toSelectValue(value: string) {
  return value === '' ? SELECT_NONE : value
}

export function fromSelectValue(value: string) {
  return value === SELECT_NONE ? '' : value
}
```

`src/lib/forms/add-task.ts`:

```typescript
import { z } from 'zod'

export const addTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  notes: z.string(),
  projectId: z.string(),
  dueDate: z.string(),
})

export type AddTaskValues = z.input<typeof addTaskSchema>

export function emptyAddTaskValues(projectId = ''): AddTaskValues {
  return { title: '', notes: '', projectId, dueDate: '' }
}

export function toCreateTaskArgs(values: AddTaskValues) {
  return {
    title: values.title.trim(),
    notes: values.notes.trim() || undefined,
    projectId: values.projectId || undefined,
    dueDate: values.dueDate || undefined,
  }
}
```

`src/lib/forms/edit-task.ts`:

```typescript
import { z } from 'zod'

export const taskStatusSchema = z.enum([
  'backlog',
  'in-progress',
  'review',
  'test',
  'investigate',
  'done',
])

export const editTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  notes: z.string(),
  status: taskStatusSchema,
  projectId: z.string(),
  estimateHours: z.string().refine(
    (s) => s === '' || (!Number.isNaN(Number(s)) && Number(s) >= 0),
    'Enter a number 0 or greater',
  ),
  dueDate: z.string(),
  priority: z.enum(['', '1', '2', '3']),
})

export type EditTaskValues = z.input<typeof editTaskSchema>

export function valuesFromTask(task: {
  title: string
  notes?: string
  status: EditTaskValues['status']
  projectId?: string
  estimateMinutes?: number
  dueDate?: string
  priority?: number
}): EditTaskValues {
  return {
    title: task.title,
    notes: task.notes ?? '',
    status: task.status,
    projectId: task.projectId ?? '',
    estimateHours:
      task.estimateMinutes != null ? String(task.estimateMinutes / 60) : '',
    dueDate: task.dueDate ?? '',
    priority:
      task.priority === 1 || task.priority === 2 || task.priority === 3
        ? String(task.priority)
        : '',
  }
}

export function toUpdateTaskArgs(values: EditTaskValues) {
  return {
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    status: values.status,
    projectId: values.projectId || null,
    estimateMinutes:
      values.estimateHours === ''
        ? null
        : Math.round(Number(values.estimateHours) * 60),
    dueDate: values.dueDate || null,
    priority: values.priority === '' ? null : Number(values.priority),
  }
}
```

`src/lib/forms/add-time-block.ts`:

```typescript
import { z } from 'zod'
import { formatDateKey, startOfDayMs } from '../dates'

export const addTimeBlockSchema = z
  .object({
    taskId: z.string(),
    creatingTask: z.boolean(),
    newTaskTitle: z.string(),
    intent: z.string().trim().min(1, 'Intent is required'),
    dateKey: z.string().min(1),
    startTime: z.string().min(1),
    durationMinutes: z
      .number()
      .min(15, 'Duration must be at least 15 minutes'),
  })
  .superRefine((value, ctx) => {
    if (value.creatingTask && value.newTaskTitle.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['newTaskTitle'],
        message: 'Enter a title for the new task.',
      })
    }
  })

export type AddTimeBlockValues = z.input<typeof addTimeBlockSchema>

export function emptyAddTimeBlockValues(overrides: {
  taskId?: string
  intent?: string
  dateKey?: string
  startTime?: string
} = {}): AddTimeBlockValues {
  return {
    taskId: overrides.taskId ?? '',
    creatingTask: false,
    newTaskTitle: '',
    intent: overrides.intent ?? '',
    dateKey: overrides.dateKey ?? formatDateKey(),
    startTime: overrides.startTime ?? '09:00',
    durationMinutes: 60,
  }
}

export function msFromDateAndTime(dateKey: string, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return (
    startOfDayMs(new Date(dateKey + 'T00:00:00')) +
    hours * 3600000 +
    minutes * 60000
  )
}

export function timeFromMs(ms: number, dateKey: string) {
  const dayStart = startOfDayMs(new Date(dateKey + 'T00:00:00'))
  const offset = ms - dayStart
  const hours = Math.floor(offset / 3600000)
  const minutes = Math.floor((offset % 3600000) / 60000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function toCreateBlockArgs(values: AddTimeBlockValues) {
  const start = msFromDateAndTime(values.dateKey, values.startTime)
  return {
    title: values.intent.trim(),
    start,
    end: start + values.durationMinutes * 60000,
    taskId: values.taskId || undefined,
  }
}
```

`src/lib/forms/review-block.ts`:

```typescript
import { z } from 'zod'

export const reviewBlockSchema = z.object({
  outcome: z.enum(['done', 'partial', 'missed']),
  actualMinutes: z.number().min(1),
  focus: z.enum(['', 'deep', 'shallow', 'interrupted']),
  note: z.string(),
  nextStep: z.string(),
  scheduleNext: z.boolean(),
  blocked: z.boolean(),
  blockedReason: z.string(),
})

export type ReviewBlockValues = z.input<typeof reviewBlockSchema>

export function emptyReviewBlockValues(actualMinutes: number): ReviewBlockValues {
  return {
    outcome: 'done',
    actualMinutes,
    focus: '',
    note: '',
    nextStep: '',
    scheduleNext: false,
    blocked: false,
    blockedReason: '',
  }
}

export function toReviewBlockArgs(values: ReviewBlockValues) {
  return {
    outcome: values.outcome,
    actualMinutes: values.actualMinutes,
    focus: values.focus || undefined,
    note: values.note.trim() || undefined,
    nextStep: values.nextStep.trim() || undefined,
    blockedReason: values.blocked
      ? values.blockedReason.trim() || undefined
      : undefined,
    scheduleNext: values.scheduleNext || undefined,
  }
}
```

`src/lib/forms/create-project.ts`:

```typescript
import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
})

export type CreateProjectValues = z.input<typeof createProjectSchema>
```

`src/lib/forms/shutdown-note.ts`:

```typescript
import { z } from 'zod'

export const shutdownNoteSchema = z.object({
  note: z.string(),
})

export type ShutdownNoteValues = z.input<typeof shutdownNoteSchema>
```

- [ ] **Step 5: Run the tests and make sure they pass**

```bash
npx vitest run src/lib/forms
```

Expected: PASS (all `src/lib/forms/*.test.ts`).

- [ ] **Step 6: Confirm existing Convex tests still run**

```bash
npx vitest run convex
```

Expected: PASS. If `include` change broke Convex discovery, restore the convex glob (it is still listed first in `include`).

---

### Task 2: Form hook and shadcn field kit

**Files:**
- Modify: `package.json` (add `@tanstack/react-form`)
- Create: `src/components/ui/field.tsx` (via shadcn CLI)
- Create: `src/components/form/form-contexts.ts`
- Create: `src/components/form/fields.tsx`
- Create: `src/components/form/form-hook.ts`

**Interfaces:**
- Consumes: `toSelectValue` / `fromSelectValue` from Task 1; shadcn `Input`, `Textarea`, `Select`, `Checkbox`, `Button`
- Produces: `useAppForm` with `TextField`, `TextareaField`, `SelectField`, `CheckboxField`, `SubmitButton`, `FormError`

- [ ] **Step 1: Install TanStack Form and add shadcn Field**

```bash
npm install @tanstack/react-form
npx shadcn@latest add field --yes
```

Expected: `src/components/ui/field.tsx` exports `Field`, `FieldLabel`, `FieldError`, `FieldGroup` (and other Field primitives). Do not add a react-hook-form `form` component. If the CLI prompts for a style, keep `new-york` from `components.json`.

- [ ] **Step 2: Create form contexts**

`src/components/form/form-contexts.ts`:

```typescript
import { createFormHookContexts } from '@tanstack/react-form'

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()
```

- [ ] **Step 3: Create field components**

`src/components/form/fields.tsx`:

```typescript
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Field,
  FieldError,
  FieldLabel,
} from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { fromSelectValue, toSelectValue } from '~/lib/forms/select-none'
import { useFieldContext, useFormContext } from './form-contexts'

function fieldErrorItems(errors: Array<unknown>) {
  return errors.flatMap((error) => {
    if (typeof error === 'string') return [{ message: error }]
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return [{ message: error.message }]
    }
    return []
  })
}

type TextFieldProps = {
  label: string
  id?: string
  placeholder?: string
  type?: 'text' | 'date' | 'time' | 'number'
  autoFocus?: boolean
  min?: number
  step?: number
}

export function TextField({
  label,
  id,
  type = 'text',
  ...inputProps
}: TextFieldProps) {
  const field = useFieldContext<string | number>()
  const isInvalid = field.state.meta.errors.length > 0
  const value = field.state.value
  const stringValue =
    typeof value === 'number' && Number.isNaN(value) ? '' : String(value)

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...inputProps}
        id={id}
        type={type}
        value={stringValue}
        aria-invalid={isInvalid || undefined}
        onBlur={field.handleBlur}
        onChange={(event) => {
          if (typeof field.state.value === 'number') {
            field.handleChange(event.target.valueAsNumber)
          } else {
            field.handleChange(event.target.value)
          }
        }}
      />
      <FieldError errors={fieldErrorItems(field.state.meta.errors)} />
    </Field>
  )
}

type TextareaFieldProps = {
  label: string
  id?: string
  placeholder?: string
  rows?: number
}

export function TextareaField({ label, id, ...props }: TextareaFieldProps) {
  const field = useFieldContext<string>()
  const isInvalid = field.state.meta.errors.length > 0

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        {...props}
        id={id}
        value={field.state.value}
        aria-invalid={isInvalid || undefined}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      <FieldError errors={fieldErrorItems(field.state.meta.errors)} />
    </Field>
  )
}

type SelectOption = { value: string; label: string }

type SelectFieldProps = {
  label: string
  id?: string
  placeholder?: string
  disabled?: boolean
  options: Array<SelectOption>
}

export function SelectField({
  label,
  id,
  placeholder,
  disabled,
  options,
}: SelectFieldProps) {
  const field = useFieldContext<string>()
  const isInvalid = field.state.meta.errors.length > 0

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={toSelectValue(field.state.value)}
        disabled={disabled}
        onValueChange={(value) => field.handleChange(fromSelectValue(value))}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={isInvalid}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value === '' ? 'none' : option.value}
              value={toSelectValue(option.value)}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={fieldErrorItems(field.state.meta.errors)} />
    </Field>
  )
}

type CheckboxFieldProps = {
  label: string
  disabled?: boolean
}

export function CheckboxField({ label, disabled }: CheckboxFieldProps) {
  const field = useFieldContext<boolean>()

  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <Checkbox
        checked={field.state.value}
        disabled={disabled}
        onCheckedChange={(value) => field.handleChange(value === true)}
      />
      <FieldLabel className="font-normal">{label}</FieldLabel>
    </Field>
  )
}

export function SubmitButton({
  label,
  variant,
}: {
  label: string
  variant?: React.ComponentProps<typeof Button>['variant']
}) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" variant={variant} disabled={isSubmitting}>
          {label}
        </Button>
      )}
    </form.Subscribe>
  )
}

function submitFormMessage(error: unknown): string | null {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'form' in error) {
    const formError = (error as { form?: unknown }).form
    return typeof formError === 'string' ? formError : null
  }
  return null
}

export function FormError() {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
      {(error) => {
        const message = submitFormMessage(error)
        return message ? (
          <p className="text-sm text-destructive">{message}</p>
        ) : null
      }}
    </form.Subscribe>
  )
}
```

If `React.ComponentProps` needs a React import, add `import type { ComponentProps } from 'react'` and type `variant?: ComponentProps<typeof Button>['variant']`.

- [ ] **Step 4: Create `useAppForm`**

`src/components/form/form-hook.ts`:

```typescript
import { createFormHook } from '@tanstack/react-form'
import {
  CheckboxField,
  FormError,
  SelectField,
  SubmitButton,
  TextareaField,
  TextField,
} from './fields'
import { fieldContext, formContext } from './form-contexts'

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    TextareaField,
    SelectField,
    CheckboxField,
  },
  formComponents: {
    SubmitButton,
    FormError,
  },
})
```

- [ ] **Step 5: Typecheck the new modules**

```bash
npx tsc --noEmit
```

Expected: PASS, or only pre-existing errors unrelated to `src/components/form`. Fix any errors in the new files (missing React import, FieldError `errors` prop shape). If shadcn `FieldError` does not accept `errors`, pass children:

```tsx
<FieldError>{fieldErrorItems(field.state.meta.errors)[0]?.message}</FieldError>
```

---

### Task 3: Add-task modal

**Files:**
- Modify: `src/components/tasks/AddTaskModal.tsx`

**Interfaces:**
- Consumes: `useAppForm`, `addTaskSchema`, `emptyAddTaskValues`, `toCreateTaskArgs`
- Produces: same `AddTaskModal` props as today; no page wiring changes

- [ ] **Step 1: Rewrite `AddTaskModal` onto `useAppForm`**

Replace `src/components/tasks/AddTaskModal.tsx` with:

```tsx
import { useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useAppForm } from '~/components/form/form-hook'
import { FieldGroup } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import {
  addTaskSchema,
  emptyAddTaskValues,
  toCreateTaskArgs,
} from '~/lib/forms/add-task'

type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  lockProject?: boolean
}

const MUTATION_ERROR = 'Could not create the task. Please try again.'

export function AddTaskModal({
  open,
  onClose,
  defaultProjectId,
  lockProject = false,
}: AddTaskModalProps) {
  const projects = useQuery(api.projects.list, { status: 'active' })
  const createTask = useMutation(api.tasks.create)

  const form = useAppForm({
    defaultValues: emptyAddTaskValues(defaultProjectId ?? ''),
    validators: { onSubmit: addTaskSchema },
    onSubmit: async ({ value }) => {
      try {
        const args = toCreateTaskArgs(value)
        await createTask({
          title: args.title,
          notes: args.notes,
          projectId: args.projectId
            ? (args.projectId as Id<'projects'>)
            : undefined,
          dueDate: args.dueDate,
        })
        onClose()
      } catch {
        form.setErrorMap({ onSubmit: { form: MUTATION_ERROR } })
      }
    },
  })

  useEffect(() => {
    if (!open) return
    form.reset(emptyAddTaskValues(defaultProjectId ?? ''))
  }, [open, defaultProjectId])

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form.AppForm>
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.AppField name="title">
                {(field) => (
                  <field.TextField
                    id="add-title"
                    label="Title"
                    autoFocus
                    placeholder="What needs doing?"
                  />
                )}
              </form.AppField>
              <form.AppField name="notes">
                {(field) => (
                  <field.TextareaField
                    id="add-notes"
                    label="Notes"
                    rows={3}
                    placeholder="Optional details"
                  />
                )}
              </form.AppField>
              <form.AppField name="projectId">
                {(field) => (
                  <field.SelectField
                    id="add-project"
                    label="Project"
                    placeholder="No project"
                    disabled={lockProject}
                    options={[
                      { value: '', label: 'No project' },
                      ...(projects ?? []).map((project) => ({
                        value: project._id,
                        label: project.name,
                      })),
                    ]}
                  />
                )}
              </form.AppField>
              <form.AppField name="dueDate">
                {(field) => (
                  <field.TextField id="add-due" label="Due date" type="date" />
                )}
              </form.AppField>
            </FieldGroup>
            <form.FormError />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <form.SubmitButton label="Add task" />
            </DialogFooter>
          </form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
```

Keep the non-suspense `useQuery` — this modal stays always-mounted.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS. If `form.reset` or `setErrorMap` types disagree with the installed Form version, match the installed API while keeping the same behavior (reset on open; show `MUTATION_ERROR` on catch).

- [ ] **Step 3: Manual check**

Open Backlog → New task. Submit empty: title error under the field. Fill title and submit: modal closes and the task appears. Cancel discards values. Reopen starts empty (except locked project on project detail).

---

### Task 4: Edit-task modal

**Files:**
- Modify: `src/components/tasks/EditTaskModal.tsx`

**Interfaces:**
- Consumes: `editTaskSchema`, `valuesFromTask`, `toUpdateTaskArgs`, `useAppForm`
- Produces: same props; delete confirm stays local `useState`

- [ ] **Step 1: Rewrite the details form**

Keep `TaskHistory`, tabs, and delete-confirm UI. Replace field `useState` + `handleSubmit` with:

```tsx
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { useAppForm } from '~/components/form/form-hook'
import { FieldGroup } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { TaskHistory } from '~/components/tasks/TaskHistory'
import {
  editTaskSchema,
  toUpdateTaskArgs,
  valuesFromTask,
} from '~/lib/forms/edit-task'

type EditTaskModalProps = {
  task: Doc<'tasks'> | null
  onClose: () => void
}

const MUTATION_ERROR = 'Could not save the task. Please try again.'
const DELETE_ERROR = 'Could not delete the task. Please try again.'

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'test', label: 'Test' },
  { value: 'investigate', label: 'Investigate' },
  { value: 'done', label: 'Done' },
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'None' },
  { value: '1', label: 'Low' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'High' },
]

export function EditTaskModal({ task, onClose }: EditTaskModalProps) {
  const projects = useQuery(api.projects.list, { status: 'active' })
  const updateTask = useMutation(api.tasks.update)
  const removeTask = useMutation(api.tasks.remove)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const form = useAppForm({
    defaultValues: task
      ? valuesFromTask(task)
      : valuesFromTask({ title: '', status: 'backlog' }),
    validators: { onSubmit: editTaskSchema },
    onSubmit: async ({ value }) => {
      if (!task) return
      try {
        const args = toUpdateTaskArgs(value)
        await updateTask({
          taskId: task._id,
          title: args.title,
          notes: args.notes,
          status: args.status,
          projectId: args.projectId
            ? (args.projectId as Id<'projects'>)
            : null,
          estimateMinutes: args.estimateMinutes,
          dueDate: args.dueDate,
          priority: args.priority,
        })
        onClose()
      } catch {
        form.setErrorMap({ onSubmit: { form: MUTATION_ERROR } })
      }
    },
  })

  useEffect(() => {
    if (!task) return
    form.reset(valuesFromTask(task))
    setConfirmingDelete(false)
    setDeleteError(null)
    setDeleting(false)
  }, [task])

  const handleDelete = async () => {
    if (!task || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await removeTask({ taskId: task._id })
      onClose()
    } catch {
      setDeleteError(DELETE_ERROR)
      setDeleting(false)
    }
  }

  return (
    <Dialog
      open={task != null}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        {task ? (
          <Tabs defaultValue="details">
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1">
                Details
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-4">
              <form.AppForm>
                <form
                  className="flex flex-col gap-3.5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void form.handleSubmit()
                  }}
                >
                  <FieldGroup>
                    <form.AppField name="title">
                      {(field) => (
                        <field.TextField
                          id="edit-title"
                          label="Title"
                          autoFocus
                          placeholder="What needs doing?"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="notes">
                      {(field) => (
                        <field.TextareaField
                          id="edit-notes"
                          label="Notes"
                          rows={3}
                          placeholder="Optional details"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="status">
                      {(field) => (
                        <field.SelectField
                          id="edit-status"
                          label="Status"
                          options={STATUS_OPTIONS}
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="estimateHours">
                      {(field) => (
                        <field.TextField
                          id="edit-estimate"
                          label="Estimate (hours)"
                          type="number"
                          min={0}
                          step={0.5}
                          placeholder="Optional"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="projectId">
                      {(field) => (
                        <field.SelectField
                          id="edit-project"
                          label="Project"
                          placeholder="No project"
                          options={[
                            { value: '', label: 'No project' },
                            ...(projects ?? []).map((project) => ({
                              value: project._id,
                              label: project.name,
                            })),
                          ]}
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="dueDate">
                      {(field) => (
                        <field.TextField
                          id="edit-due"
                          label="Due date"
                          type="date"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="priority">
                      {(field) => (
                        <field.SelectField
                          id="edit-priority"
                          label="Priority"
                          placeholder="None"
                          options={PRIORITY_OPTIONS}
                        />
                      )}
                    </form.AppField>
                  </FieldGroup>
                  <form.FormError />
                  {deleteError ? (
                    <p className="text-sm text-destructive">{deleteError}</p>
                  ) : null}
                  <div className="mt-1.5 flex items-center justify-between gap-2.5">
                    {confirmingDelete ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Delete this task?</span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void handleDelete()}
                          disabled={deleting}
                        >
                          Delete
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setConfirmingDelete(false)}
                        >
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirmingDelete(true)}
                      >
                        Delete
                      </Button>
                    )}
                    <div className="flex items-center gap-2.5">
                      <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                      </Button>
                      <form.SubmitButton label="Save changes" />
                    </div>
                  </div>
                </form>
              </form.AppForm>
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <TaskHistory
                taskId={task._id}
                estimateMinutes={task.estimateMinutes}
              />
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
```

`estimateHours` stays a **string** field (`type="number"` on the input, `handleChange` uses the string branch because default is `''`).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Manual check**

Open a task. Fields match the task. Clear title and save: field error. Save valid changes: modal closes. Delete confirm still works and is not part of the schema.

---

### Task 5: Add-time-block modal

**Files:**
- Modify: `src/components/time-block/AddTimeBlockModal.tsx`

**Interfaces:**
- Consumes: `addTimeBlockSchema`, `emptyAddTimeBlockValues`, `timeFromMs`, `toCreateBlockArgs`
- Produces: same props; `__create_task__` stays a UI trigger, never a schema value

- [ ] **Step 1: Rewrite the modal**

The task picker is custom (create-task sentinel). Other fields use the kit.

```tsx
import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useAppForm } from '~/components/form/form-hook'
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  addTimeBlockSchema,
  emptyAddTimeBlockValues,
  timeFromMs,
  toCreateBlockArgs,
} from '~/lib/forms/add-time-block'
import { formatDateKey } from '~/lib/dates'

type AddTimeBlockModalProps = {
  open: boolean
  onClose: () => void
  defaultTaskId?: Id<'tasks'>
  defaultIntent?: string
  defaultStart?: number
  defaultDateKey?: string
}

const CREATE_TASK_VALUE = '__create_task__'
const MUTATION_ERROR = 'Could not create the time block. Please try again.'

export function AddTimeBlockModal({
  open,
  onClose,
  defaultTaskId,
  defaultIntent,
  defaultStart,
  defaultDateKey,
}: AddTimeBlockModalProps) {
  const tasks = useQuery(api.tasks.list, {})
  const createTask = useMutation(api.tasks.create)
  const createBlock = useMutation(api.timeBlocks.create)
  const backlogTasks = useMemo(
    () => (tasks ?? []).filter((task) => task.status !== 'done'),
    [tasks],
  )

  const form = useAppForm({
    defaultValues: emptyAddTimeBlockValues(),
    validators: { onSubmit: addTimeBlockSchema },
    onSubmit: async ({ value }) => {
      try {
        let taskId = value.taskId ? (value.taskId as Id<'tasks'>) : undefined
        if (value.creatingTask) {
          taskId = await createTask({ title: value.newTaskTitle.trim() })
        }
        const args = toCreateBlockArgs({ ...value, taskId: taskId ?? '' })
        await createBlock({
          title: args.title,
          start: args.start,
          end: args.end,
          taskId,
        })
        onClose()
      } catch {
        form.setErrorMap({ onSubmit: { form: MUTATION_ERROR } })
      }
    },
  })

  useEffect(() => {
    if (!open) return
    const dateKey = defaultDateKey ?? formatDateKey()
    form.reset(
      emptyAddTimeBlockValues({
        taskId: defaultTaskId ?? '',
        intent: defaultIntent ?? '',
        dateKey,
        startTime:
          defaultStart != null ? timeFromMs(defaultStart, dateKey) : '09:00',
      }),
    )
  }, [open, defaultTaskId, defaultIntent, defaultStart, defaultDateKey])

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add time block</DialogTitle>
        </DialogHeader>
        <form.AppForm>
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Subscribe
                selector={(state) => [
                  state.values.taskId,
                  state.values.creatingTask,
                ]}
              >
                {([taskId, creatingTask]) => (
                  <Field>
                    <FieldLabel htmlFor="block-task">Task</FieldLabel>
                    <Select
                      value={
                        creatingTask
                          ? CREATE_TASK_VALUE
                          : taskId
                            ? taskId
                            : 'none'
                      }
                      onValueChange={(value) => {
                        if (value === CREATE_TASK_VALUE) {
                          form.setFieldValue('creatingTask', true)
                          form.setFieldValue('taskId', '')
                          return
                        }
                        form.setFieldValue('creatingTask', false)
                        form.setFieldValue(
                          'taskId',
                          value === 'none' ? '' : value,
                        )
                      }}
                    >
                      <SelectTrigger id="block-task" className="w-full">
                        <SelectValue placeholder="Personal block (no task)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Personal block (no task)
                        </SelectItem>
                        {backlogTasks.map((task) => (
                          <SelectItem key={task._id} value={task._id}>
                            {task.title}
                          </SelectItem>
                        ))}
                        <SelectItem value={CREATE_TASK_VALUE}>
                          + Create new task…
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Subscribe>
              <form.Subscribe selector={(state) => state.values.creatingTask}>
                {(creatingTask) =>
                  creatingTask ? (
                    <form.AppField name="newTaskTitle">
                      {(field) => (
                        <field.TextField
                          id="block-new-task"
                          label="New task title"
                          placeholder="Task name"
                        />
                      )}
                    </form.AppField>
                  ) : null
                }
              </form.Subscribe>
              <form.AppField name="intent">
                {(field) => (
                  <field.TextField
                    id="block-intent"
                    label="What will you get done?"
                    autoFocus
                    placeholder="Concrete intent for this sitting"
                  />
                )}
              </form.AppField>
              <form.AppField name="dateKey">
                {(field) => (
                  <field.TextField id="block-date" label="Date" type="date" />
                )}
              </form.AppField>
              <div className="grid grid-cols-2 gap-3">
                <form.AppField name="startTime">
                  {(field) => (
                    <field.TextField
                      id="block-start"
                      label="Start"
                      type="time"
                    />
                  )}
                </form.AppField>
                <form.AppField name="durationMinutes">
                  {(field) => (
                    <field.TextField
                      id="block-duration"
                      label="Duration (minutes)"
                      type="number"
                      min={15}
                      step={15}
                    />
                  )}
                </form.AppField>
              </div>
            </FieldGroup>
            <form.FormError />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <form.SubmitButton label="Add block" />
            </DialogFooter>
          </form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
```

`durationMinutes` is a **number**. `TextField` must use `valueAsNumber` for that field.

- [ ] **Step 2: Typecheck and schema tests**

```bash
npx tsc --noEmit
npx vitest run src/lib/forms/add-time-block.test.ts
```

Expected: both PASS.

- [ ] **Step 3: Manual check**

Today → Add time block. Empty intent: field error. Choose “Create new task” with blank title: `newTaskTitle` error. Create with intent only: personal block. Create with new task: task exists and is linked.

---

### Task 6: Review-block modal

**Files:**
- Modify: `src/components/time-block/ReviewBlockModal.tsx`

**Interfaces:**
- Consumes: `reviewBlockSchema`, `emptyReviewBlockValues`, `toReviewBlockArgs`
- Produces: same props; outcome stays the three-button toggle (no RadioGroup)

- [ ] **Step 1: Rewrite the modal**

Keep the summary card and `cn` outcome buttons. Bind outcome through `form.AppField`. Use `CheckboxField` for schedule/blocked. Show `blockedReason` TextField when `blocked` is true. Disable schedule checkbox when `nextStep` is blank or `block.taskId` is missing.

```tsx
// Outcome field (inside the form):
<form.AppField name="outcome">
  {(field) => (
    <Field>
      <FieldLabel>Outcome</FieldLabel>
      <div className="flex rounded-md border border-input p-0.5">
        {OUTCOMES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={cn(
              'flex-1 rounded-sm px-2 py-1.5 text-sm transition-colors',
              field.state.value === item.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
            onClick={() => field.handleChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Field>
  )}
</form.AppField>
```

`onSubmit`:

```tsx
await reviewBlock({
  blockId: block._id,
  ...toReviewBlockArgs(value),
})
if (onSaved) onSaved()
else onClose()
```

Mutation error copy: `Could not save the review. Please try again.`

Reset on `block`/`open`:

```tsx
useEffect(() => {
  if (!block || !open) return
  const plannedMinutes = Math.round((block.end - block.start) / 60000)
  form.reset(emptyReviewBlockValues(plannedMinutes))
}, [block, open])
```

Submit button label: `onSaved ? 'Save & next' : 'Save'`.

Preserve existing imports for `msToTimeLabel`, `Dialog*`, `cn`, and the block summary card markup.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Manual check**

Review a finished block. Outcome toggle still looks the same. Save succeeds. “Schedule it now” disabled until next step is filled and the block has a task. Blocked reason field appears only when Blocked is checked.

---

### Task 7: Create-project row and shutdown-note dialog

**Files:**
- Modify: `src/routes/_authenticated/projects/index.tsx`
- Modify: `src/routes/_authenticated/today.tsx`

**Interfaces:**
- Consumes: `createProjectSchema`, `shutdownNoteSchema`, `useAppForm`
- Produces: inline create row (not a modal); shutdown note stays in the Close-the-day dialog. Today’s intention textarea is unchanged.

- [ ] **Step 1: Convert the projects create row**

Replace `name` / `showForm` submit handler with `useAppForm`. Keep `showForm` as visibility state. Color remains `COLORS[projects.length % COLORS.length]`.

```tsx
const form = useAppForm({
  defaultValues: { name: '' },
  validators: { onSubmit: createProjectSchema },
  onSubmit: async ({ value }) => {
    try {
      await createProject({
        name: value.name.trim(),
        color: COLORS[projects.length % COLORS.length],
      })
      form.reset({ name: '' })
      setShowForm(false)
    } catch {
      form.setErrorMap({
        onSubmit: { form: 'Could not create the project. Please try again.' },
      })
    }
  },
})
```

Render the existing flex row with `form.AppField name="name"` → `TextField` (placeholder `Project name`) and `form.SubmitButton label="Create"`. Include `form.FormError`.

- [ ] **Step 2: Convert the shutdown-note dialog only**

In `today.tsx`, remove `shutdownNote`, `shutdownSaving`, `shutdownError`, and `handleSaveShutdown`. Keep `intentionBody` and its blur save.

```tsx
const shutdownForm = useAppForm({
  defaultValues: { note: data.dayRecord?.shutdownNote ?? '' },
  validators: { onSubmit: shutdownNoteSchema },
  onSubmit: async ({ value }) => {
    try {
      await completeShutdown({
        note: value.note.trim(),
        dateKey: data.dateKey,
      })
      setShutdownNoteOpen(false)
    } catch {
      shutdownForm.setErrorMap({
        onSubmit: { form: 'Could not complete shutdown. Please try again.' },
      })
    }
  },
})
```

Reset when the dialog opens:

```tsx
useEffect(() => {
  if (!shutdownNoteOpen) return
  shutdownForm.reset({ note: data.dayRecord?.shutdownNote ?? '' })
}, [shutdownNoteOpen, data.dayRecord?._id, data.dayRecord?.shutdownNote])
```

Wrap the dialog body in `shutdownForm.AppForm` + `<form onSubmit={preventDefault; handleSubmit}>` with `TextareaField` (placeholder unchanged, rows={5}) and `SubmitButton label="Shutdown complete"`. Cancel remains a type=button that closes the dialog.

- [ ] **Step 3: Typecheck and full unit tests**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: `tsc` PASS; Vitest PASS for both `src/**/*.test.ts` and `convex/**/*.test.ts`.

- [ ] **Step 4: Manual check**

Projects: New project with empty name shows `Name is required`. Valid name creates a card. Failed mutation would show the new form error.

Today: intention still saves on blur. Shutdown note dialog submits through the form; empty note is allowed.

---

## Verification

After Task 7:

```bash
npx vitest run
npx tsc --noEmit
```

Walk these UI paths once:

1. Add task (Backlog and Project detail with locked project)
2. Edit task + delete confirm
3. Add time block (personal, existing task, create-new-task)
4. Review block + shutdown Save & next
5. Create project
6. Shutdown note
7. Notes page and today’s intention still behave as before (out of scope)

## Spec coverage

| Spec item | Task |
|-----------|------|
| Zod schemas + tests | 1 |
| `useAppForm` + shadcn Field kit | 2 |
| Select `"none"` mapping | 1 (`select-none`) + 2 (`SelectField`) |
| Add task modal | 3 |
| Edit task modal | 4 |
| Add time block + create-task `superRefine` | 1 + 5 |
| Review block, custom outcome toggle | 6 |
| Create project error on failure | 7 |
| Shutdown note dialog | 7 |
| Out of scope surfaces untouched | 7 verification |
| No Convex API changes | all |
