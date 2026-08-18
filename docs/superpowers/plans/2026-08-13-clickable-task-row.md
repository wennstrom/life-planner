# Clickable Task Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole `TaskRow` open the edit modal on click, with pointer cursor and subtle hover highlight.

**Architecture:** Keep `onOpenDetails` as the sole open trigger. When set, the `<li>` becomes the interactive surface (click + Enter/Space). Nested status/delete controls stop propagation. Title is plain text.

**Tech Stack:** React, Tailwind, existing shadcn controls in `TaskRow`.

## Global Constraints

- Touch only `src/components/tasks/TaskRow.tsx` for behavior.
- No parent API / modal / Convex changes.
- Hover: subtle `hover:bg-accent/40` + `cursor-pointer` when details can open.
- Delete remains `group-hover` / `group-focus-within` visible.

---

### Task 1: Clickable TaskRow

**Files:**
- Modify: `src/components/tasks/TaskRow.tsx`

**Interfaces:**
- Consumes: existing `onOpenDetails?: () => void`
- Produces: unchanged props; row opens details when handler is set

- [x] **Step 1: Update TaskRow to make the list item interactive**

Replace the title `<button>` with a span. Wire the `<li>`:

```tsx
<li
  className={cn(
    'group flex items-center gap-3 rounded-md border border-border bg-card p-3 shadow-soft transition-colors',
    onOpenDetails &&
      'cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  )}
  role={onOpenDetails ? 'button' : undefined}
  tabIndex={onOpenDetails ? 0 : undefined}
  onClick={onOpenDetails}
  onKeyDown={
    onOpenDetails
      ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenDetails()
          }
        }
      : undefined
  }
>
```

Title:

```tsx
<span
  className={cn(
    'flex-1 text-sm',
    done && 'text-muted-foreground line-through',
  )}
>
  {task.title}
</span>
```

Ensure delete uses `stopPropagation` and `opacity-0 … group-hover:opacity-100 group-focus-within:opacity-100`. Status select already stops propagation on the trigger.

- [x] **Step 2: Manual verify**

On Today/Backlog: hover highlight, click opens modal, status/delete don’t, keyboard Enter/Space works.

- [ ] **Step 3: Commit** (only if user asks)
