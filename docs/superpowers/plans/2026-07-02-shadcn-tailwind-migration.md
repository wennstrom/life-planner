# shadcn + Tailwind Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 653-line bespoke `src/styles/planner.css` with shadcn components + Tailwind v4 utilities, preserving the current visual design, migrating foundation-first then view-by-view until `planner.css` is deleted.

**Architecture:** Tailwind v4 is already wired via `@tailwindcss/vite`. We add shadcn primitives (Radix-based) into `~/components/ui`, map the existing design tokens into shadcn's semantic CSS variables in `src/styles/app.css`, and link `app.css` alongside `planner.css` during migration. Each view is converted to utilities + primitives; `planner.css` shrinks and is deleted last.

**Tech Stack:** React 19, TanStack Start/Router, Convex, Tailwind CSS v4, shadcn/ui (new-york style), Radix UI, lucide-react, class-variance-authority, tailwind-merge.

---

## Conventions For This Plan

- **No UI unit tests exist** (`e2e/smoke.spec.ts` checks the sign-in button by role; `convex/*.test.ts` are backend). A styling migration has no meaningful failing-test-first cycle, so each task's **verification gate is:**
  1. `npm run lint` (runs `tsc && eslint . --ext ts,tsx --max-warnings 0`) — must pass with zero errors/warnings.
  2. Manual visual check in `npm run dev` against the current design (screenshot/eyeball the affected view).
- **Both stylesheets are linked during migration.** `app.css` (Tailwind + tokens) is added in Task 2 *in addition to* `planner.css`. Legacy classes keep working until their view is migrated. `planner.css` is deleted in the final task.
- **Path alias is `~/` → `src/`** (not shadcn's default `@/`). `components.json` is configured for `~`; verify generated imports use `~`.
- **Commit after every task.** Small, frequent commits.
- Run all `npm`/`npx` commands from the repo root `/Users/oskarw/Code/life-planner`.

### Radix Select gotcha (applies to Tasks 6 & 7)

Radix `Select` (shadcn Select) **forbids an empty-string `value`** on `SelectItem` — it reserves `""` internally. The current native selects use `value=""` for "No project" / "None" / priority "None". When converting to shadcn Select, use the sentinel `"none"` for the empty option and translate at the state boundary:

```tsx
// reading into the control
value={projectId || 'none'}
// writing back to state
onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}
```

The backlog filter select (Task 10) already uses non-empty values (`'all'`, `'none'`, projectId), so no sentinel translation is needed there.

### Card & Badge realization

The spec maps several elements to shadcn `Card`. In practice, the compact list/grid cards (task rows, note items, project cards, calendar drawer) are realized as **card-style utility containers** (`rounded-* border border-border bg-card shadow-soft`) because shadcn's `Card` ships with `CardHeader`/`CardContent` structure and `py-6` padding that fights these dense layouts. The shadcn `Card` component itself is used where its container fits cleanly (the sign-in screen, Task 14). All colored pills (project tags, nav count, note tags) use the shadcn `Badge` component with a `rounded-full` className and, where the color is per-project, an inline `style` override.

---

## File Structure

**Created:**
- `components.json` — shadcn CLI config (aliases point at `~`).
- `src/lib/utils.ts` — `cn()` helper.
- `src/components/ui/*.tsx` — shadcn primitives (button, input, textarea, label, select, card, badge, checkbox, progress, skeleton, avatar, dialog).

**Modified (design tokens + wiring):**
- `src/styles/app.css` — Tailwind import + `tw-animate-css` + token block + residual calendar CSS.
- `src/routes/__root.tsx` — link `app.css`; drop `planner.css` link in final task.
- `package.json` — new deps (added by CLI/npm).

**Modified (view/component migrations):**
- `src/components/layout/AppShell.tsx`
- `src/components/tasks/AddTaskModal.tsx`, `EditTaskModal.tsx`, `TaskRow.tsx`
- `src/components/layout/PagePending.tsx`
- `src/routes/_authenticated/today.tsx`, `backlog.tsx`, `notes.tsx`, `calendar.tsx`
- `src/routes/_authenticated/projects/index.tsx`, `projects/$projectId.tsx`
- `src/components/calendar/WeekView.tsx`, `DayRail.tsx`
- `src/routes/sign-in.tsx`, `src/components/auth/AuthGate.tsx`

**Deleted (final task):**
- `src/styles/planner.css`

---

## Task 1: Install dependencies + shadcn config + `cn` util

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install runtime + dev dependencies**

Run:

```bash
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install -D tw-animate-css
```

Expected: packages added; no peer-dependency errors that block install.

- [ ] **Step 2: Create `components.json` configured for the `~` alias and Tailwind v4**

Create `components.json` (note `tailwind.config` is an empty string — the canonical v4 marker; `css` points at the existing `app.css`):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/app.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "~/components",
    "utils": "~/lib/utils",
    "ui": "~/components/ui",
    "lib": "~/lib",
    "hooks": "~/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 3: Create the `cn` helper**

Create `src/lib/utils.ts`:

```ts
import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`
Expected: PASS (zero errors/warnings). `cn` is unused for now, but it is an exported module member, so `noUnusedLocals` does not flag it.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json components.json src/lib/utils.ts
git commit -m "chore: add shadcn config, cn util, and UI deps"
```

---

## Task 2: Theme tokens + wire `app.css` into the root

**Files:**
- Modify: `src/styles/app.css`
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Replace `src/styles/app.css` with the token mapping**

Overwrite `src/styles/app.css` entirely:

```css
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.875rem;

  --background: #f6f7fb;
  --foreground: #1e2233;
  --card: #ffffff;
  --card-foreground: #1e2233;
  --popover: #ffffff;
  --popover-foreground: #1e2233;
  --primary: #6366f1;
  --primary-foreground: #ffffff;
  --secondary: #f1f3f9;
  --secondary-foreground: #1e2233;
  --muted: #f1f3f9;
  --muted-foreground: #6b7280;
  --accent: #f1f3f9;
  --accent-foreground: #1e2233;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #e6e8ef;
  --input: #e6e8ef;
  --ring: #6366f1;

  /* Project-specific tokens (tags, calendar events, day rail) */
  --success: #22c55e;
  --warning: #eab308;
  --event-work: #16a34a;
  --event-personal: #6366f1;
  --event-google: #ca8a04;
}

.dark {
  /* Dark-mode token slots scaffolded for later. Intentionally empty:
     values will be added when dark mode is built. */
}

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-event-work: var(--event-work);
  --color-event-personal: var(--event-personal);
  --color-event-google: var(--event-google);

  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  --shadow-soft: 0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px rgba(16, 24, 40, 0.06);
}

@layer components {
  /* Residual scoped CSS kept intentionally (utilities would be ugly here).
     Hour gridlines behind the calendar week columns. */
  .cal-grid {
    background-image: repeating-linear-gradient(
      to bottom,
      transparent,
      transparent 53px,
      var(--border) 53px,
      var(--border) 54px
    );
  }
}
```

Note: the gridline stops (53/54px) match the calendar's `HOUR_HEIGHT = 54`.

- [ ] **Step 2: Link `app.css` in `__root.tsx` (keep `planner.css` too)**

In `src/routes/__root.tsx`, add the import and a link entry. `app.css` must be listed **before** `planner.css` so legacy unlayered rules still win during migration.

Change the imports near the top:

```tsx
import plannerCss from '~/styles/planner.css?url'
import appCss from '~/styles/app.css?url'
```

Change the `links` array so it starts with `app.css`:

```tsx
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'stylesheet', href: plannerCss },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      { rel: 'icon', href: '/favicon.ico' },
    ],
```

- [ ] **Step 3: Verify lint + dev boot**

Run: `npm run lint`
Expected: PASS.

Run: `npm run dev`, open the app. Expected: the app looks the same as before (Tailwind preflight is in `@layer base`, so `planner.css` unlayered rules still win). No crash, no missing-stylesheet error.

- [ ] **Step 4: Commit**

```bash
git add src/styles/app.css src/routes/__root.tsx
git commit -m "feat: map design tokens into shadcn theme and load app.css"
```

---

## Task 3: Add shadcn primitives

**Files:**
- Create: `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `card.tsx`, `badge.tsx`, `checkbox.tsx`, `progress.tsx`, `skeleton.tsx`, `avatar.tsx`, `dialog.tsx`
- Modify: `package.json` (Radix deps added by CLI)

- [ ] **Step 1: Add primitives via the shadcn CLI**

Run:

```bash
npx shadcn@latest add button input textarea label select card badge checkbox progress skeleton avatar dialog
```

Expected: files created under `src/components/ui/`; Radix dependencies (`@radix-ui/react-*`) installed. If the CLI prompts to overwrite `app.css` or `components.json`, **decline** — our config and tokens are already correct.

- [ ] **Step 2: Verify generated imports use the `~` alias**

Run: `npm run lint`
Expected: PASS. If any generated file imports from `@/lib/utils` or `@/components/...`, replace `@/` with `~/` in those files, then re-run `npm run lint` until it passes.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/components/ui
git commit -m "feat: add shadcn ui primitives"
```

---

## Task 4: Migrate `AppShell` / `Sidebar`

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

Replaces legacy `.app`, `.sidebar`, `.brand`, `.nav*`, `.sidebar-footer`, `.google-status`, `.user`, `.avatar`, `.main` with utilities + `Avatar`/`Badge` + lucide icons.

- [ ] **Step 1: Rewrite `AppShell.tsx`**

Overwrite `src/components/layout/AppShell.tsx`:

```tsx
import { Link, useRouterState } from '@tanstack/react-router'
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { memo } from 'react'
import type { ReactNode } from 'react'
import {
  CalendarDays,
  CalendarClock,
  ListTodo,
  LogOut,
  StickyNote,
  Sun,
  FolderKanban,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { cn } from '~/lib/utils'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'

const navItems: Array<{
  to: string
  label: string
  icon: LucideIcon
  countKey?: 'backlog'
}> = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/backlog', label: 'Backlog', icon: ListTodo, countKey: 'backlog' },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/notes', label: 'Notes', icon: StickyNote },
]

function SidebarInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const viewer = useQuery(api.users.viewer)
  const backlog = useQuery(api.backlog.get)
  const { signOut } = useAuthActions()
  const { isAuthenticated } = useConvexAuth()

  const initials =
    viewer?.user?.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '?'

  return (
    <aside className="flex w-62 shrink-0 flex-col border-r border-border bg-card px-3.5 py-5">
      <div className="flex items-center gap-2.5 px-2.5 pb-4 pt-1.5 text-lg font-bold">
        <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-primary-foreground">
          <CalendarClock className="size-4" />
        </span>
        <span>Planner</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(`${item.to}/`)
          const count =
            item.countKey === 'backlog' ? backlog?.total : undefined
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{item.label}</span>
              {count !== undefined && count > 0 ? (
                <Badge
                  className={cn(
                    'rounded-full border-0 px-2 py-0.5 text-xs font-semibold',
                    active
                      ? 'bg-card text-primary'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {count}
                </Badge>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 pt-3.5">
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              'size-2 rounded-full',
              viewer?.googleConnected ? 'bg-success' : 'bg-slate-400',
            )}
          />
          {viewer?.googleConnected ? 'Google connected' : 'Google not connected'}
        </div>
        {isAuthenticated ? (
          <button
            type="button"
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            onClick={() => void signOut()}
          >
            <LogOut className="size-[18px]" />
            Sign out
          </button>
        ) : null}
        <div className="mt-1 flex items-center gap-2.5 border-t border-border px-3 py-2.5">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold">
              {viewer?.user?.name ?? 'Guest'}
            </div>
            <div className="text-xs text-muted-foreground">
              {viewer?.user?.email ?? ''}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-10 py-8">{children}</main>
    </div>
  )
}
```

Note: `w-62` = 248px (`62 * 4px`), matching `--sidebar-w`. The avatar uses a solid primary fallback (the old gradient is dropped for simplicity; note this trade-off in the commit).

- [ ] **Step 2: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`, check the sidebar renders with icons, active highlighting, backlog count badge, Google status dot, user block.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: migrate AppShell/Sidebar to Tailwind + shadcn"
```

---

## Task 5: Migrate `AddTaskModal` to shadcn `Dialog`

**Files:**
- Modify: `src/components/tasks/AddTaskModal.tsx`

Replaces the native `<dialog className="modal">` + `.field`/`.btn` with `Dialog`, `Input`, `Textarea`, `Label`, `Select`, `Button`. See the **Radix Select gotcha** above.

- [ ] **Step 1: Rewrite `AddTaskModal.tsx`**

Overwrite `src/components/tasks/AddTaskModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  lockProject?: boolean
  // Non-visible schedule pass-through: pages (e.g. Today) can auto-schedule
  // the created task so it lands in the day's list, independent of due date.
  scheduledDate?: string
}

export function AddTaskModal({
  open,
  onClose,
  defaultProjectId,
  lockProject = false,
  scheduledDate,
}: AddTaskModalProps) {
  // Non-suspense useQuery: this component is always mounted, so it must not
  // suspend the page while projects load.
  const projects = useQuery(api.projects.list, { status: 'active' })
  const createTask = useMutation(api.tasks.create)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setTitle('')
    setNotes('')
    setProjectId(defaultProjectId ?? '')
    setDueDate('')
    setError(null)
    setPending(false)
  }, [open, defaultProjectId])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle || pending) return

    setPending(true)
    setError(null)
    try {
      await createTask({
        title: trimmedTitle,
        notes: notes.trim() || undefined,
        projectId: projectId ? (projectId as Id<'projects'>) : undefined,
        scheduledDate: scheduledDate || undefined,
        dueDate: dueDate || undefined,
      })
      onClose()
    } catch {
      setError('Could not create the task. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-title">Title</Label>
            <Input
              id="add-title"
              required
              autoFocus
              placeholder="What needs doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-notes">Notes</Label>
            <Textarea
              id="add-notes"
              rows={3}
              placeholder="Optional details"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-project">Project</Label>
            <Select
              value={projectId || 'none'}
              disabled={lockProject}
              onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="add-project" className="w-full">
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {(projects ?? []).map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-due">Due date</Label>
            <Input
              id="add-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Add task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`. On Today/Backlog, click "+ Add task". Verify: dialog opens centered with backdrop, Escape/overlay-click closes it, the project select works (including "No project"), submitting creates a task and closes.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/AddTaskModal.tsx
git commit -m "feat: migrate AddTaskModal to shadcn Dialog"
```

---

## Task 6: Migrate `EditTaskModal` to shadcn `Dialog`

**Files:**
- Modify: `src/components/tasks/EditTaskModal.tsx`

Same pattern as Task 5, plus a Priority select and the delete/confirm footer. `open` is derived from `task != null`. Uses the Radix Select sentinel for both Project (`''` ↔ `'none'`) and Priority (`''` ↔ `'none'`).

- [ ] **Step 1: Rewrite `EditTaskModal.tsx`**

Overwrite `src/components/tasks/EditTaskModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

type EditTaskModalProps = {
  task: Doc<'tasks'> | null
  onClose: () => void
}

export function EditTaskModal({ task, onClose }: EditTaskModalProps) {
  // Non-suspense useQuery: this component is always mounted at page level, so
  // it must not suspend the page while projects load.
  const projects = useQuery(api.projects.list, { status: 'active' })
  const updateTask = useMutation(api.tasks.update)
  const removeTask = useMutation(api.tasks.remove)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Hydrate the form when a task is selected for editing.
  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setNotes(task.notes ?? '')
    setProjectId(task.projectId ?? '')
    setScheduledDate(task.scheduledDate ?? '')
    setDueDate(task.dueDate ?? '')
    setPriority(task.priority != null ? String(task.priority) : '')
    setError(null)
    setPending(false)
    setConfirmingDelete(false)
  }, [task])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle || pending) return

    setPending(true)
    setError(null)
    try {
      await updateTask({
        taskId: task._id,
        title: trimmedTitle,
        notes: notes.trim() || null,
        projectId: projectId ? (projectId as Id<'projects'>) : null,
        scheduledDate: scheduledDate || null,
        dueDate: dueDate || null,
        priority: priority ? Number(priority) : null,
      })
      onClose()
    } catch {
      setError('Could not save the task. Please try again.')
    } finally {
      setPending(false)
    }
  }

  const handleDelete = async () => {
    if (!task || pending) return
    setPending(true)
    setError(null)
    try {
      await removeTask({ taskId: task._id })
      onClose()
    } catch {
      setError('Could not delete the task. Please try again.')
      setPending(false)
    }
  }

  return (
    <Dialog
      open={task != null}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              required
              autoFocus
              placeholder="What needs doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              rows={3}
              placeholder="Optional details"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-project">Project</Label>
            <Select
              value={projectId || 'none'}
              onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="edit-project" className="w-full">
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {(projects ?? []).map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-scheduled">Scheduled date</Label>
            <Input
              id="edit-scheduled"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-due">Due date</Label>
            <Input
              id="edit-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-priority">Priority</Label>
            <Select
              value={priority || 'none'}
              onValueChange={(v) => setPriority(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="edit-priority" className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="1">Low</SelectItem>
                <SelectItem value="2">Medium</SelectItem>
                <SelectItem value="3">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <div className="mt-1.5 flex items-center justify-between gap-2.5">
            {confirmingDelete ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Delete this task?</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleDelete}
                  disabled={pending}
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
              <Button type="submit" disabled={pending}>
                Save changes
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`. Click a task title to open the edit dialog. Verify: fields hydrate from the task, project/priority selects work, Save persists, the Delete → confirm → Delete/Keep flow works, Escape/overlay closes.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/EditTaskModal.tsx
git commit -m "feat: migrate EditTaskModal to shadcn Dialog"
```

---

## Task 7: Migrate `TaskRow`

**Files:**
- Modify: `src/components/tasks/TaskRow.tsx`

Replaces `.task`, `.check`, `.task-title`, `.tag`, `.mini-btn` with utilities + `Checkbox` + `Button`. The project tag keeps its dynamic per-project color via inline style + `color-mix`.

- [ ] **Step 1: Rewrite `TaskRow.tsx`**

Overwrite `src/components/tasks/TaskRow.tsx`:

```tsx
import type { CSSProperties } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { Checkbox } from '~/components/ui/checkbox'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'

type TaskRowProps = {
  task: Doc<'tasks'> & { project?: Doc<'projects'> | null }
  onToggle?: () => void
  onSendToToday?: () => void
  onRemoveFromToday?: () => void
  onOpenDetails?: () => void
  showProjectTag?: boolean
}

export function TaskRow({
  task,
  onToggle,
  onSendToToday,
  onRemoveFromToday,
  onOpenDetails,
  showProjectTag = true,
}: TaskRowProps) {
  const done = task.status === 'done'

  return (
    <li className="group flex items-center gap-3 rounded-md border border-border bg-card p-3 shadow-soft">
      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle?.()}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
        className="size-5 rounded-md data-[state=checked]:border-success data-[state=checked]:bg-success"
      />
      {onOpenDetails ? (
        <button
          type="button"
          className={cn(
            'flex-1 text-left text-sm hover:underline',
            done && 'text-muted-foreground line-through hover:no-underline',
          )}
          onClick={onOpenDetails}
        >
          {task.title}
        </button>
      ) : (
        <span
          className={cn(
            'flex-1 text-sm',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </span>
      )}
      {showProjectTag && task.project ? (
        <Badge
          className="rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold"
          style={
            {
              color: task.project.color,
              backgroundColor: `color-mix(in srgb, ${task.project.color} 14%, transparent)`,
            } as CSSProperties
          }
        >
          {task.project.name}
        </Badge>
      ) : null}
      {onSendToToday ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-primary opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onSendToToday}
        >
          → Today
        </Button>
      ) : null}
      {onRemoveFromToday ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-primary opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onRemoveFromToday}
        >
          Remove
        </Button>
      ) : null}
    </li>
  )
}
```

- [ ] **Step 2: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`. On Today/Backlog: checkbox toggles complete (turns green + strikethrough), title opens the edit dialog, hover reveals the → Today / Remove buttons, project tag shows in its color.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TaskRow.tsx
git commit -m "feat: migrate TaskRow to Tailwind + shadcn Checkbox/Button"
```

---

## Task 8: Migrate `Today` view

**Files:**
- Modify: `src/routes/_authenticated/today.tsx`

Replaces `.view`, `.view-header`, `.view-sub`, `.view-actions`, `.today-grid`, `.col-title`, `.task-list`, `.quick-note`, `.note-box`, `.muted`, `.btn primary` with utilities + `Button` + `Textarea`.

- [ ] **Step 1: Rewrite `today.tsx`**

Replace the returned JSX (keep all hooks/imports/logic the same; add the `Button` and `Textarea` imports). The full component body:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { DayRail } from '~/components/calendar/DayRail'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { TaskRow } from '~/components/tasks/TaskRow'
import { formatDisplayDate } from '~/lib/dates'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'

export const Route = createFileRoute('/_authenticated/today')({
  component: TodayPage,
})

function TodayPage() {
  const { data } = useSuspenseQuery(convexQuery(api.today.get, {}))
  const { data: quickNote } = useSuspenseQuery(convexQuery(api.today.getQuickNote, {}))
  const { data: blocks } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listForDay, { dateKey: data.dateKey }),
  )

  const completeTask = useMutation(api.tasks.complete)
  const removeFromToday = useMutation(api.tasks.removeFromToday)
  const saveQuickNote = useMutation(api.today.saveQuickNote)
  const createFromTask = useMutation(api.timeBlocks.createFromTask)
  const updateBlock = useMutation(api.timeBlocks.update)

  const [addOpen, setAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
  const [noteBody, setNoteBody] = useState(quickNote?.body ?? '')

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDisplayDate(new Date())} · {data.tasks.length} tasks ·{' '}
            {blocks.length} time blocks
          </p>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          + Add task
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today&apos;s Todo
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.tasks.map((task) => (
              <TaskRow
                key={task._id}
                task={task}
                onToggle={() =>
                  void completeTask({ taskId: task._id, done: task.status !== 'done' })
                }
                onRemoveFromToday={() => void removeFromToday({ taskId: task._id })}
                onOpenDetails={() => setEditingTask(task)}
              />
            ))}
          </ul>

          <div className="mt-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick note
            </h3>
            <Textarea
              className="min-h-[72px] bg-card shadow-soft"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              onBlur={() => void saveQuickNote({ body: noteBody })}
              rows={4}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today&apos;s schedule{' '}
            <span className="font-normal normal-case text-muted-foreground">
              ↔ Google
            </span>
          </h3>
          <DayRail
            blocks={blocks}
            tasks={data.tasks}
            date={new Date()}
            onCreateFromTask={(taskId, start, end) =>
              void createFromTask({ taskId, start, end })
            }
            onUpdateBlock={(blockId, patch) => void updateBlock({ blockId, ...patch })}
          />
        </div>
      </div>

      <AddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        scheduledDate={data.dateKey}
      />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
    </section>
  )
}
```

- [ ] **Step 2: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`, open Today. Verify: header, two-column grid (stacks under `md`), task list, quick note textarea (saves on blur), day rail still renders (still on legacy CSS until Task 13).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/today.tsx
git commit -m "feat: migrate Today view to Tailwind + shadcn"
```

---

## Task 9: Migrate `Backlog` view

**Files:**
- Modify: `src/routes/_authenticated/backlog.tsx`

Replaces header/actions, `.filter-chips` + `.filter-chip` select, `.backlog-groups`, `.group-title`, `.swatch`, `.task-list` with utilities + `Button` + `Select`. The filter select uses non-empty values, so no sentinel needed.

- [ ] **Step 1: Rewrite `backlog.tsx`**

Overwrite `src/routes/_authenticated/backlog.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { TaskRow } from '~/components/tasks/TaskRow'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

export const Route = createFileRoute('/_authenticated/backlog')({
  component: BacklogPage,
})

function BacklogPage() {
  const { data } = useSuspenseQuery(convexQuery(api.backlog.get, {}))
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const sendToToday = useMutation(api.tasks.sendToToday)
  const completeTask = useMutation(api.tasks.complete)

  const [filter, setFilter] = useState<Id<'projects'> | 'all' | 'none'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
  const defaultProjectId =
    filter !== 'all' && filter !== 'none' ? filter : undefined

  const filteredGroups = useMemo(() => {
    if (filter === 'all') return data.groups
    if (filter === 'none') {
      return data.groups.filter((group) => group.key === 'none')
    }
    return data.groups.filter((group) => group.key === filter)
  }, [data.groups, filter])

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Backlog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.total} unscheduled tasks
          </p>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          + Add task
        </Button>
      </header>

      <div className="mb-5">
        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as Id<'projects'> | 'all' | 'none')}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No project</SelectItem>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project._id} value={project._id}>
                <span
                  className="mr-2 inline-block size-2.5 rounded-full align-middle"
                  style={{ background: project.color }}
                />
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-6">
        {filteredGroups.map((group) => (
          <div key={group.key}>
            <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: group.color ?? '#94a3b8' }}
              />
              {group.label}
            </h4>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task._id}
                  task={{ ...task, project: null }}
                  showProjectTag={false}
                  onToggle={() =>
                    void completeTask({
                      taskId: task._id,
                      done: task.status === 'done' ? false : true,
                    })
                  }
                  onSendToToday={() => void sendToToday({ taskId: task._id })}
                  onOpenDetails={() => setEditingTask(task)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <AddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultProjectId={defaultProjectId}
      />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
    </section>
  )
}
```

Note: the original had color swatches inside native `<option>` (which browsers don't render). shadcn `SelectItem` renders real markup, so the swatch now actually shows — a small visual improvement, not a regression.

- [ ] **Step 2: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`, open Backlog. Verify: header, project filter select (filters groups), grouped task lists with color dots.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/backlog.tsx
git commit -m "feat: migrate Backlog view to Tailwind + shadcn Select"
```

---

## Task 10: Migrate `PagePending` to `Skeleton`

**Files:**
- Modify: `src/components/layout/PagePending.tsx`

Replaces `.page-pending*` shimmer with shadcn `Skeleton`.

- [ ] **Step 1: Rewrite `PagePending.tsx`**

Overwrite `src/components/layout/PagePending.tsx`:

```tsx
import { Skeleton } from '~/components/ui/skeleton'

export function PagePending() {
  return (
    <section aria-busy="true" aria-live="polite">
      <header className="mb-6">
        <Skeleton className="mb-2.5 h-7 w-36" />
        <Skeleton className="h-4 w-56" />
      </header>
      <div className="mt-2 flex flex-col gap-3">
        <Skeleton className="h-3.5 w-full max-w-[480px]" />
        <Skeleton className="h-3.5 w-full max-w-[480px]" />
        <Skeleton className="h-3.5 w-full max-w-[320px]" />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`, navigate between routes to trigger the pending state (throttle network in devtools if needed). Verify the skeleton shimmer appears.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/PagePending.tsx
git commit -m "feat: migrate PagePending to shadcn Skeleton"
```

---

## Task 11: Migrate `Projects` list + detail

**Files:**
- Modify: `src/routes/_authenticated/projects/index.tsx`
- Modify: `src/routes/_authenticated/projects/$projectId.tsx`

Replaces `.project-cards`, `.project-card`, `.project-bar`, `.project-desc`, `.project-meta`, `.progress`/`.progress-fill`, `.add-card`, `.add-plus`, `.search`, and (in detail) `.note-item*` with utilities + `Card` + `Progress` + `Input` + `Button`. The per-project accent color is applied inline.

- [ ] **Step 1: Rewrite `projects/index.tsx`**

Overwrite `src/routes/_authenticated/projects/index.tsx`:

```tsx
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Progress } from '~/components/ui/progress'

export const Route = createFileRoute('/_authenticated/projects/')({
  component: ProjectsPage,
})

const COLORS = ['#6366f1', '#22c55e', '#eab308', '#ec4899', '#14b8a6']

function ProjectsPage() {
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const { data: tasks } = useSuspenseQuery(convexQuery(api.tasks.list, {}))
  const createProject = useMutation(api.projects.create)

  const [name, setName] = useState('')
  const [showForm, setShowForm] = useState(false)

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length} active
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm(true)}>
          + New project
        </Button>
      </header>

      {showForm ? (
        <form
          className="mb-5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            void createProject({
              name: name.trim(),
              color: COLORS[projects.length % COLORS.length],
            })
            setName('')
            setShowForm(false)
          }}
        >
          <Input
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit">Create</Button>
        </form>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[18px]">
        {projects.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project._id)
          const done = projectTasks.filter((task) => task.status === 'done').length
          const progress =
            projectTasks.length === 0 ? 0 : Math.round((done / projectTasks.length) * 100)

          return (
            <Link
              key={project._id}
              to="/projects/$projectId"
              params={{ projectId: project._id }}
              className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span
                className="absolute inset-y-0 left-0 w-[5px]"
                style={{ background: project.color }}
              />
              <h3 className="mb-1.5 text-base font-semibold">{project.name}</h3>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                {project.description ?? 'No description yet.'}
              </p>
              <div className="mb-3 flex gap-2 text-sm text-muted-foreground">
                <span>{projectTasks.length} tasks</span>
                <span>·</span>
                <span>{done} done</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </Link>
          )
        })}

        <button
          type="button"
          className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:bg-secondary"
          onClick={() => setShowForm(true)}
        >
          <Plus className="size-7" />
          <span>New project</span>
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Rewrite `projects/$projectId.tsx`**

Overwrite `src/routes/_authenticated/projects/$projectId.tsx`:

```tsx
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { TaskRow } from '~/components/tasks/TaskRow'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/_authenticated/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const projectIdTyped = projectId as Id<'projects'>
  const { data } = useSuspenseQuery(
    convexQuery(api.projects.get, { projectId: projectIdTyped }),
  )
  const completeTask = useMutation(api.tasks.complete)
  const archiveProject = useMutation(api.projects.update)

  const [addOpen, setAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <Link to="/projects" className="text-[13px] text-muted-foreground hover:underline">
            ← Projects
          </Link>
          <h1 className="text-2xl font-bold">{data.project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.project.description ?? 'Project detail'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void archiveProject({
                projectId: projectIdTyped,
                status: 'archived',
              }).then(() => window.history.back())
            }
          >
            Archive
          </Button>
          <Button type="button" onClick={() => setAddOpen(true)}>
            + Add task
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tasks
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.tasks.map((task) => (
              <TaskRow
                key={task._id}
                task={{ ...task, project: data.project }}
                onToggle={() =>
                  void completeTask({ taskId: task._id, done: task.status !== 'done' })
                }
                onOpenDetails={() => setEditingTask(task)}
              />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes
          </h3>
          {data.notes.length === 0 ? (
            <p className="text-muted-foreground">
              No notes attached to this project yet.
            </p>
          ) : (
            data.notes.map((note) => (
              <div
                key={note._id}
                className="mb-2 rounded-md border border-border bg-card p-3 shadow-soft"
              >
                <div className="text-sm font-semibold">{note.title}</div>
                <div className="truncate text-[13px] text-muted-foreground">
                  {note.body.slice(0, 120)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultProjectId={projectIdTyped}
        lockProject
      />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
    </section>
  )
}
```

- [ ] **Step 3: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`, open Projects. Verify: cards grid with left color bar + progress bar, "New project" dashed add-card + inline create form; click a card → detail page with tasks + notes columns, Archive + Add task buttons.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/projects/index.tsx src/routes/_authenticated/projects/\$projectId.tsx
git commit -m "feat: migrate Projects views to Tailwind + shadcn Card/Progress"
```

---

## Task 12: Migrate `Notes` view

**Files:**
- Modify: `src/routes/_authenticated/notes.tsx`

Replaces `.notes-layout`, `.notes-list`, `.search`, `.note-item*`, `.note-editor`, `.note-title-input`, `.note-editor-meta`, `.note-body`, `.note-item-tag` with utilities + `Input` + `Button`. Note tags keep dynamic per-project color inline.

- [ ] **Step 1: Rewrite `notes.tsx`**

Overwrite `src/routes/_authenticated/notes.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../../convex/_generated/api'
import { relativeTime } from '~/lib/dates'
import { cn } from '~/lib/utils'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'

const QUICK_NOTE_TITLE = '__today_quick_note__'

export const Route = createFileRoute('/_authenticated/notes')({
  component: NotesPage,
})

function ProjectTag({ color, label }: { color: string; label: string }) {
  return (
    <Badge
      className="rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold"
      style={
        {
          color,
          backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        } as CSSProperties
      }
    >
      {label}
    </Badge>
  )
}

function StandaloneTag() {
  return (
    <Badge className="rounded-full border-0 bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      Standalone
    </Badge>
  )
}

function NotesPage() {
  const { data: notes } = useSuspenseQuery(convexQuery(api.notes.list, {}))
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const createNote = useMutation(api.notes.create)
  const updateNote = useMutation(api.notes.update)
  const removeNote = useMutation(api.notes.remove)

  const visibleNotes = useMemo(
    () => notes.filter((note) => note.title !== QUICK_NOTE_TITLE),
    [notes],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredNotes = visibleNotes.filter((note) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      note.title.toLowerCase().includes(q) || note.body.toLowerCase().includes(q)
    )
  })

  const activeNote = filteredNotes.find((note) => note._id === selectedId)
  const activeProjectColor =
    projects.find((p) => p._id === activeNote?.projectId)?.color ?? '#6366f1'
  const activeProjectName = projects.find(
    (p) => p._id === activeNote?.projectId,
  )?.name

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visibleNotes.length} notes
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            void createNote({ title: 'Untitled note', body: '' }).then((id) =>
              setSelectedId(id),
            )
          }}
        >
          + New note
        </Button>
      </header>

      <div className="grid h-[calc(100vh-170px)] grid-cols-1 gap-5 md:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-2 overflow-y-auto">
          <Input
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filteredNotes.map((note) => {
            const project = projects.find((p) => p._id === note.projectId)
            return (
              <button
                key={note._id}
                type="button"
                className={cn(
                  'w-full rounded-md border bg-card p-3 text-left shadow-soft transition-colors',
                  selectedId === note._id
                    ? 'border-primary ring-2 ring-primary/10'
                    : 'border-border',
                )}
                onClick={() => setSelectedId(note._id)}
              >
                <div className="mb-0.5 text-sm font-semibold">{note.title}</div>
                <div className="mb-2 truncate text-[13px] text-muted-foreground">
                  {note.body.slice(0, 80) || 'Empty note'}
                </div>
                {project ? (
                  <ProjectTag color={project.color} label={project.name} />
                ) : (
                  <StandaloneTag />
                )}
              </button>
            )
          })}
        </aside>

        {activeNote ? (
          <section className="overflow-y-auto rounded-xl border border-border bg-card p-8 shadow-soft">
            <input
              className="mb-2.5 w-full border-none bg-transparent text-2xl font-bold outline-none"
              value={activeNote.title}
              onChange={(e) =>
                void updateNote({ noteId: activeNote._id, title: e.target.value })
              }
            />
            <div className="mb-6 flex items-center gap-3 text-[13px]">
              {activeNote.projectId ? (
                <ProjectTag
                  color={activeProjectColor}
                  label={activeProjectName ?? ''}
                />
              ) : (
                <StandaloneTag />
              )}
              <span className="text-muted-foreground">
                Edited {relativeTime(activeNote.updatedAt)}
              </span>
              <Button
                type="button"
                variant="outline"
                className="ml-auto"
                onClick={() => void removeNote({ noteId: activeNote._id })}
              >
                Delete
              </Button>
            </div>
            <textarea
              className="min-h-[360px] w-full resize-y border-none bg-transparent text-[15px] leading-7 text-foreground outline-none"
              value={activeNote.body}
              onChange={(e) =>
                void updateNote({ noteId: activeNote._id, body: e.target.value })
              }
            />
          </section>
        ) : (
          <section className="overflow-y-auto rounded-xl border border-border bg-card p-8 shadow-soft">
            <p className="text-muted-foreground">Select or create a note.</p>
          </section>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`, open Notes. Verify: two-column layout, search filters, note items highlight when active, editor title/body edit + save, project/standalone tags, Delete.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/notes.tsx
git commit -m "feat: migrate Notes view to Tailwind + shadcn"
```

---

## Task 13: Migrate Calendar (`WeekView` + `DayRail`)

**Files:**
- Modify: `src/components/calendar/WeekView.tsx`
- Modify: `src/components/calendar/DayRail.tsx`

All drag/resize logic is unchanged — only class names/markup change. Keeps the residual `.cal-grid` gradient (from `app.css`) for the hour gridlines; everything else becomes utilities. Event color classes map to the `--event-*` tokens (`bg-event-work` / `bg-event-personal` / `bg-event-google`).

- [ ] **Step 1: Rewrite `WeekView.tsx`**

Overwrite `src/components/calendar/WeekView.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { addDays, formatDateKey, startOfDayMs, startOfWeekMonday } from '~/lib/dates'

const HOUR_HEIGHT = 54
const START_HOUR = 9
const END_HOUR = 16

type WeekViewProps = {
  blocks: Array<Doc<'timeBlocks'>>
  unscheduledTasks: Array<Doc<'tasks'>>
  anchorDate: Date
  onNavigate: (date: Date) => void
  onCreateFromTask: (taskId: Doc<'tasks'>['_id'], start: number, end: number) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
}

function msToTop(ms: number, dayStartMs: number) {
  const hours = (ms - dayStartMs) / 3600000
  return (hours - START_HOUR) * HOUR_HEIGHT
}

function eventColor(block: Doc<'timeBlocks'>) {
  if (block.origin === 'google') return 'bg-event-google'
  if (block.taskId) return 'bg-event-work'
  return 'bg-event-personal'
}

export function WeekView({
  blocks,
  unscheduledTasks,
  anchorDate,
  onNavigate,
  onCreateFromTask,
  onUpdateBlock,
}: WeekViewProps) {
  const [dragTaskId, setDragTaskId] = useState<Doc<'tasks'>['_id'] | null>(null)
  const weekStart = startOfWeekMonday(anchorDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()],
  )

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    [],
  )

  return (
    <div className="flex items-start gap-5 max-md:flex-col">
      <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
        <div className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border">
          <div />
          {days.map((day) => {
            const weekend = day.getDay() === 0 || day.getDay() === 6
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex flex-col gap-0.5 border-l border-border px-1 py-2.5 text-center text-xs text-muted-foreground',
                  weekend && 'bg-secondary',
                )}
              >
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
                <strong className="text-base text-foreground">
                  {day.getDate()}
                </strong>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-[44px_1fr]">
          <div className="flex flex-col">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-[54px] border-t border-border px-1.5 py-0.5 text-right text-[11px] text-muted-foreground first:border-t-0"
              >
                {hour}
              </div>
            ))}
          </div>
          <div className="cal-grid grid grid-cols-7">
            {days.map((day) => {
              const dayStart = startOfDayMs(day)
              const dayEnd = dayStart + 24 * 60 * 60 * 1000
              const dayBlocks = blocks.filter(
                (b) => b.start < dayEnd && b.end > dayStart,
              )
              const weekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'relative min-h-[406px] border-l border-border',
                    weekend && 'bg-secondary',
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (!dragTaskId) return
                    const rect = event.currentTarget.getBoundingClientRect()
                    const top = event.clientY - rect.top
                    const hoursFromStart = top / HOUR_HEIGHT + START_HOUR
                    const start = dayStart + hoursFromStart * 3600000
                    onCreateFromTask(dragTaskId, start, start + 3600000)
                    setDragTaskId(null)
                  }}
                >
                  {dayBlocks.map((block) => {
                    const top = msToTop(block.start, dayStart)
                    const height = Math.max(
                      24,
                      ((block.end - block.start) / 3600000) * HOUR_HEIGHT,
                    )
                    return (
                      <div
                        key={block._id}
                        className={cn(
                          'absolute inset-x-[3px] overflow-hidden rounded-md px-1.5 py-1 text-[11.5px] font-medium text-white',
                          eventColor(block),
                        )}
                        style={{ top, height }}
                        onMouseDown={(event) => {
                          const startY = event.clientY
                          const startTop = top
                          const onMove = (moveEvent: MouseEvent) => {
                            const delta = moveEvent.clientY - startY
                            const newTop = Math.max(0, startTop + delta)
                            const hoursOffset = newTop / HOUR_HEIGHT + START_HOUR
                            const newStart = dayStart + hoursOffset * 3600000
                            onUpdateBlock(block._id, {
                              start: newStart,
                              end: newStart + (block.end - block.start),
                            })
                          }
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove)
                            window.removeEventListener('mouseup', onUp)
                          }
                          window.addEventListener('mousemove', onMove)
                          window.addEventListener('mouseup', onUp)
                        }}
                      >
                        {block.title}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <aside className="w-[210px] shrink-0 rounded-xl border border-border bg-card p-4 shadow-soft max-md:w-full">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Unscheduled{' '}
          <span className="font-normal normal-case text-muted-foreground">
            drag →
          </span>
        </h4>
        {unscheduledTasks.map((task) => (
          <div
            key={task._id}
            className="mb-2 cursor-grab rounded-md border border-dashed border-slate-300 bg-secondary px-2.5 py-2 text-[13px]"
            draggable
            onDragStart={() => setDragTaskId(task._id)}
          >
            ⠿ {task.title}
          </div>
        ))}
        <div className="mt-4 flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <i className="inline-block size-2.5 rounded-[3px] bg-event-work" />
            Work
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block size-2.5 rounded-[3px] bg-event-personal" />
            Personal
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block size-2.5 rounded-[3px] bg-event-google" />
            From Google
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onNavigate(addDays(anchorDate, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onNavigate(new Date())}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onNavigate(addDays(anchorDate, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Week of {formatDateKey(weekStart)}
        </p>
      </aside>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `DayRail.tsx`**

Overwrite `src/components/calendar/DayRail.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { startOfDayMs } from '~/lib/dates'

const HOUR_HEIGHT = 54
const START_HOUR = 8
const END_HOUR = 16

type DayRailProps = {
  blocks: Array<Doc<'timeBlocks'>>
  tasks: Array<Doc<'tasks'>>
  date: Date
  onCreateFromTask: (taskId: Doc<'tasks'>['_id'], start: number, end: number) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number; title?: string },
  ) => void
}

function msToTop(ms: number, dayStartMs: number) {
  const hours = (ms - dayStartMs) / 3600000
  return (hours - START_HOUR) * HOUR_HEIGHT
}

function topToMs(top: number, dayStartMs: number) {
  const hours = top / HOUR_HEIGHT + START_HOUR
  return dayStartMs + hours * 3600000
}

function eventColor(block: Doc<'timeBlocks'>) {
  if (block.origin === 'google') return 'bg-event-google'
  if (block.taskId) return 'bg-event-work'
  return 'bg-event-personal'
}

export function DayRail({
  blocks,
  tasks,
  date,
  onCreateFromTask,
  onUpdateBlock,
}: DayRailProps) {
  const dayStartMs = startOfDayMs(date)
  const railRef = useRef<HTMLDivElement>(null)
  const [dragTaskId, setDragTaskId] = useState<Doc<'tasks'>['_id'] | null>(null)

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    [],
  )

  const handleRailDrop = (event: React.DragEvent) => {
    event.preventDefault()
    if (!dragTaskId || !railRef.current) return
    const rect = railRef.current.getBoundingClientRect()
    const top = event.clientY - rect.top
    const start = topToMs(Math.max(0, top), dayStartMs)
    const end = start + 60 * 60 * 1000
    onCreateFromTask(dragTaskId, start, end)
    setDragTaskId(null)
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2">
        {tasks.map((task) => (
          <div
            key={task._id}
            className="cursor-grab rounded-md border border-dashed border-slate-300 bg-secondary px-2.5 py-2 text-[13px]"
            draggable
            onDragStart={() => setDragTaskId(task._id)}
          >
            ⠿ {task.title}
          </div>
        ))}
      </div>
      <div
        ref={railRef}
        className="relative overflow-hidden rounded-xl border border-border bg-card shadow-soft"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleRailDrop}
      >
        {hours.map((hour) => (
          <div
            key={hour}
            className="relative h-[62px] border-t border-border first:border-t-0"
          >
            <span className="absolute -top-2 left-2.5 bg-card px-1 text-[11px] text-muted-foreground">
              {String(hour).padStart(2, '0')}
            </span>
          </div>
        ))}
        {blocks.map((block) => {
          const top = msToTop(block.start, dayStartMs)
          const height = Math.max(
            24,
            ((block.end - block.start) / 3600000) * HOUR_HEIGHT,
          )
          return (
            <DraggableBlock
              key={block._id}
              block={block}
              className={eventColor(block)}
              top={top}
              height={height}
              dayStartMs={dayStartMs}
              onUpdateBlock={onUpdateBlock}
            />
          )
        })}
      </div>
    </div>
  )
}

function DraggableBlock({
  block,
  className,
  top,
  height,
  dayStartMs,
  onUpdateBlock,
}: {
  block: Doc<'timeBlocks'>
  className: string
  top: number
  height: number
  dayStartMs: number
  onUpdateBlock: DayRailProps['onUpdateBlock']
}) {
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const startY = useRef(0)
  const startTop = useRef(top)
  const startHeight = useRef(height)

  const onMouseDownDrag = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).dataset.resizeHandle === 'true') {
      return
    }
    setDragging(true)
    startY.current = event.clientY
    startTop.current = top
  }

  const onMouseDownResize = (event: React.MouseEvent) => {
    event.stopPropagation()
    setResizing(true)
    startY.current = event.clientY
    startHeight.current = height
  }

  const onMouseMove = (event: React.MouseEvent) => {
    if (dragging) {
      const delta = event.clientY - startY.current
      const newTop = Math.max(0, startTop.current + delta)
      const newStart = topToMs(newTop, dayStartMs)
      onUpdateBlock(block._id, { start: newStart, end: newStart + (block.end - block.start) })
    }
    if (resizing) {
      const delta = event.clientY - startY.current
      const newHeight = Math.max(24, startHeight.current + delta)
      const newEnd = topToMs(top + newHeight, dayStartMs)
      onUpdateBlock(block._id, { end: newEnd })
    }
  }

  const onMouseUp = () => {
    setDragging(false)
    setResizing(false)
  }

  return (
    <div
      className={cn(
        'absolute inset-x-2 overflow-hidden rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-white',
        className,
      )}
      style={{ top, height, cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={onMouseDownDrag}
      onMouseMove={dragging || resizing ? onMouseMove : undefined}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {block.title}
      {block.origin === 'google' ? (
        <span className="ml-1.5 rounded-lg border border-white/50 px-1.5 text-[10px] opacity-85">
          Google
        </span>
      ) : null}
      <span
        data-resize-handle="true"
        className="absolute bottom-1 right-1.5 size-2.5 cursor-ns-resize opacity-50"
        onMouseDown={onMouseDownResize}
      />
    </div>
  )
}
```

Note: the legacy resize handle was detected via `classList.contains('resize-handle')`. Since we no longer use that class, this uses a `data-resize-handle="true"` attribute instead — behavior is identical.

- [ ] **Step 3: Verify lint + visual**

Run: `npm run lint` → PASS.
Run: `npm run dev`. On Calendar: week grid with gridlines, weekend shading, day headers, colored event blocks (drag to move), legend, prev/Today/next navigation, drawer. On Today: day rail with hour labels, draggable tasks, resizable blocks. Confirm drag-to-create, drag-to-move, and resize still work.

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/WeekView.tsx src/components/calendar/DayRail.tsx src/routes/_authenticated/calendar.tsx
git commit -m "feat: migrate calendar WeekView/DayRail to Tailwind + tokens"
```

Note: `calendar.tsx` header still uses `.view*`/`.btn` classes. Convert it in this task too — replace its header with the same header pattern used in Task 8 and swap the "+ New block" button to `<Button>`. Full converted `calendar.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { WeekView } from '~/components/calendar/WeekView'
import { Button } from '~/components/ui/button'
import {
  addDays,
  formatDateKey,
  startOfDayMs,
  startOfWeekMonday,
} from '~/lib/dates'

export const Route = createFileRoute('/_authenticated/calendar')({
  component: CalendarPage,
})

function CalendarPage() {
  const [anchorDate, setAnchorDate] = useState(new Date())
  const weekStart = startOfWeekMonday(anchorDate)
  const weekEnd = addDays(weekStart, 7)

  const { data: blocks } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listForRange, {
      startMs: startOfDayMs(weekStart),
      endMs: startOfDayMs(weekEnd),
    }),
  )
  const { data: tasks } = useSuspenseQuery(convexQuery(api.tasks.list, {}))
  const createFromTask = useMutation(api.timeBlocks.createFromTask)
  const updateBlock = useMutation(api.timeBlocks.update)
  const createBlock = useMutation(api.timeBlocks.create)

  const unscheduledTasks = tasks.filter(
    (task) => !task.scheduledDate && task.status !== 'done',
  )

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateKey(weekStart)} – {formatDateKey(addDays(weekStart, 6))}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            const title = window.prompt('Block title')
            if (!title) return
            const start = startOfDayMs(new Date()) + 10 * 3600000
            void createBlock({ title, start, end: start + 3600000 })
          }}
        >
          + New block
        </Button>
      </header>

      <WeekView
        blocks={blocks}
        unscheduledTasks={unscheduledTasks}
        anchorDate={anchorDate}
        onNavigate={setAnchorDate}
        onCreateFromTask={(taskId, start, end) =>
          void createFromTask({ taskId, start, end })
        }
        onUpdateBlock={(blockId, patch) => void updateBlock({ blockId, ...patch })}
      />
    </section>
  )
}
```

---

## Task 14: Migrate `sign-in` + `AuthGate`

**Files:**
- Modify: `src/routes/sign-in.tsx`
- Modify: `src/components/auth/AuthGate.tsx`

Replaces the inline-styled auth screens and `.project-card`/`.brand`/`.btn`/`.view-sub`/`.muted` usage with utilities + `Card` + `Button`. **Preserve the e2e-tested "Continue with Google" button text/role.**

- [ ] **Step 1: Rewrite `sign-in.tsx`**

Overwrite `src/routes/sign-in.tsx`:

```tsx
import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react'
import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const { signIn } = useAuthActions()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authTimedOut, setAuthTimedOut] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setAuthTimedOut(true), 10_000)
    return () => window.clearTimeout(timeout)
  }, [])

  const convexSiteUrl = (import.meta as any).env.VITE_CONVEX_SITE_URL as
    | string
    | undefined
  const googleRedirectUri = convexSiteUrl
    ? `${convexSiteUrl}/api/auth/callback/google`
    : null

  if (isLoading && !authTimedOut) {
    return <AuthScreen message="Checking session…" />
  }

  if (isAuthenticated) {
    return <Navigate to="/today" replace />
  }

  async function handleSignIn() {
    setError(null)
    setIsSigningIn(true)
    try {
      const result = await signIn('google', { redirectTo: '/today' })
      if (result.redirect) {
        return
      }
      if (result.signingIn) {
        window.location.href = '/today'
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.'
      setError(message)
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <AuthScreen
      error={error}
      googleRedirectUri={googleRedirectUri}
      isSigningIn={isSigningIn}
      onSignIn={() => void handleSignIn()}
    />
  )
}

function AuthScreen({
  message,
  error,
  googleRedirectUri,
  isSigningIn,
  onSignIn,
}: {
  message?: string
  error?: string | null
  googleRedirectUri?: string | null
  isSigningIn?: boolean
  onSignIn?: () => void
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <Card className="w-[420px] p-8 text-center shadow-soft">
        <div className="flex items-center justify-center gap-2.5 pb-2 text-lg font-bold">
          <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-primary-foreground">
            <CalendarClock className="size-4" />
          </span>
          <span>Life Planner</span>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          {message ??
            'Sign in with Google to plan your day and sync your calendar.'}
        </p>
        {onSignIn ? (
          <Button
            type="button"
            className="w-full"
            disabled={isSigningIn}
            onClick={onSignIn}
          >
            {isSigningIn ? 'Redirecting…' : 'Continue with Google'}
          </Button>
        ) : null}
        {error ? (
          <p className="mt-4 text-[13px] text-destructive">{error}</p>
        ) : null}
        {googleRedirectUri ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            If Google shows <strong>redirect_uri_mismatch</strong>, add this exact
            URI under Authorized redirect URIs in Google Cloud Console:
            <br />
            <code className="break-all text-[11px]">{googleRedirectUri}</code>
          </p>
        ) : null}
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `AuthGate.tsx` waiting screen**

In `src/components/auth/AuthGate.tsx`, replace the inline-styled waiting `<div>` with utilities:

```tsx
  if (waitingForAuth) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        Signing you in…
      </div>
    )
  }
```

- [ ] **Step 3: Verify lint + visual + e2e smoke**

Run: `npm run lint` → PASS.
Run: `npm run dev`, open `/sign-in`. Verify the card renders with the brand, subtitle, and full-width "Continue with Google" button.
Run: `npm run test:e2e`
Expected: the smoke test passes (the "Continue with Google" button is still present by role/name).

- [ ] **Step 4: Commit**

```bash
git add src/routes/sign-in.tsx src/components/auth/AuthGate.tsx
git commit -m "feat: migrate sign-in and AuthGate to Tailwind + shadcn Card"
```

---

## Task 15: Cleanup — delete `planner.css`, finalize base styles

**Files:**
- Delete: `src/styles/planner.css`
- Modify: `src/routes/__root.tsx`
- Modify: `src/styles/app.css`

At this point no component references any `planner.css` class or legacy `--bg/--surface/--text*/--accent/--green` variables except inside `app.css`/inline styles that already use the new tokens. Verify, then remove.

- [ ] **Step 1: Confirm no remaining legacy class or variable references**

Run (search should return no app-code matches — only the plan/spec docs and `planner.css` itself):

```bash
rg -n "className=\"[^\"]*(view-header|view-sub|view-actions|task-list|project-card|note-item|note-editor|cal-|day-rail|rail-hour|filter-chip|nav-item|brand|btn |modal)" src
rg -n "var\(--(bg|surface|surface-2|text|text-muted|accent|accent-soft|green|yellow|radius-sm|sidebar-w|shadow)\b" src
```

Expected: no matches in `src` other than `src/styles/planner.css` (which is about to be deleted) and the `.cal-grid` rule in `app.css` (which uses `--border`, still valid). If any component still references a legacy class/variable, migrate it before continuing.

- [ ] **Step 2: Add base body styling to `app.css`**

Append a base layer to `src/styles/app.css` (this replaces the body font/color/background that `planner.css` provided):

```css
@layer base {
  * {
    @apply border-border;
  }
  html,
  body {
    height: 100%;
    margin: 0;
  }
  body {
    @apply bg-background font-sans text-foreground antialiased;
  }
}
```

- [ ] **Step 3: Remove the `planner.css` link and import from `__root.tsx`**

In `src/routes/__root.tsx`, delete the `plannerCss` import line and the `{ rel: 'stylesheet', href: plannerCss }` entry, leaving `appCss` + the font + favicon:

```tsx
import appCss from '~/styles/app.css?url'
```

```tsx
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      { rel: 'icon', href: '/favicon.ico' },
    ],
```

- [ ] **Step 4: Delete `planner.css`**

```bash
rm src/styles/planner.css
```

- [ ] **Step 5: Verify full suite**

Run: `npm run lint` → PASS.
Run: `npm test` → PASS (Convex backend tests unaffected).
Run: `npm run test:e2e` → PASS.
Run: `npm run dev` and walk every view (Today, Backlog, Projects + detail, Calendar, Notes, sign-in). Confirm the design matches the pre-migration look and there is no FOUC on load.

- [ ] **Step 6: Commit**

```bash
git add src/styles/app.css src/routes/__root.tsx
git rm src/styles/planner.css
git commit -m "refactor: delete planner.css and finalize Tailwind base styles"
```

---

## Final Verification Checklist

- [ ] `npm run lint` passes (tsc + eslint, zero warnings).
- [ ] `npm test` passes.
- [ ] `npm run test:e2e` passes.
- [ ] `src/styles/planner.css` is deleted; only `app.css` is linked.
- [ ] Every view visually matches the pre-migration design.
- [ ] Add/Edit task dialogs open/close via Escape + overlay; selects (incl. "No project"/"None") work.
- [ ] Calendar drag-to-create, drag-to-move, and resize still function.
- [ ] No console errors; no flash of unstyled content on first paint.
