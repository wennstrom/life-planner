# CSS → shadcn + Tailwind Migration

## Problem

`src/styles/planner.css` has grown to 653 lines of bespoke, tightly-coupled class
names (`.nav-item`, `.task`, `.project-card`, `.modal`, `.cal-grid`, etc.). Every
component references these hand-written classes, making styling hard to maintain
and extend. Tailwind v4 is already installed (`@tailwindcss/vite` + a dormant
`src/styles/app.css`) but is effectively unused — only `planner.css` is linked in
`__root.tsx`.

## Goal

Migrate the UI to **shadcn components + Tailwind utilities**, preserving the current
visual design, and progressively shrink `planner.css` until it is deleted.

## Decisions (from brainstorming)

- **Approach:** Full shadcn — install Radix-based primitives (Dialog, Button,
  Select, Card, etc.) and rebuild components on top of them; Tailwind utilities for
  layout.
- **Look:** Preserve the current design. Map existing colors/radius/shadows into
  shadcn theme tokens so it looks ~identical.
- **Sequencing:** Foundation first, then migrate view-by-view. `planner.css` shrinks
  as we go.
- **Dark mode:** Light-only for now. Scaffold empty `.dark {}` token slots so dark
  mode is easy to add later; don't build/test it.
- **Complex layouts:** Pragmatic — Tailwind utilities where clean, but keep a small
  scoped CSS block for the calendar grid gradients, day-rail hour lines / now-line,
  and absolute event positioning.

## Current State (verified)

- **Tailwind v4** installed via `@tailwindcss/vite` plugin in `vite.config.ts`.
  No `tailwind.config.js`, no `postcss.config`, no `components.json`.
- `src/styles/app.css` contains `@import 'tailwindcss'` + a couple of `@layer base`
  rules but is **not imported anywhere**.
- `src/routes/__root.tsx` links **only** `planner.css` (via `?url`) plus the Inter
  Google Font.
- Path alias: `~/*` → `./src/*` (tsconfig). shadcn defaults to `@/` — must be
  overridden to `~`.
- No `~/lib/utils` (`cn`), no `~/components/ui`.
- **Tests:** the only UI test is `e2e/smoke.spec.ts`, which selects the sign-in
  button by role/name (not class). `convex/*.test.ts` are backend tests. So class
  renaming carries no test-selector risk.

## Architecture

### 1. Foundation & tooling

Configure shadcn to fit the existing Tailwind v4 + `~/` alias stack (no v3
downgrade, no `tailwind.config.js`).

- **`components.json`**: Tailwind v4, `style: "new-york"`, `rsc: false`, base color
  `neutral`, CSS file `src/styles/app.css`, cssVariables `true`. Aliases:
  - `components → ~/components`
  - `ui → ~/components/ui`
  - `utils → ~/lib/utils`
  - `lib → ~/lib`
  - `hooks → ~/hooks`
- **`~/lib/utils.ts`**: standard `cn()` = `twMerge(clsx(...))`.
- **New dependencies:** `class-variance-authority`, `clsx`, `tailwind-merge`,
  `tw-animate-css` (v4 replacement for `tailwindcss-animate`), `lucide-react`, plus
  the Radix packages each installed primitive pulls in.
- **`src/styles/app.css` becomes the real global stylesheet** and is linked in
  `__root.tsx` (replacing the direct `planner.css` link). It contains, in order:
  `@import 'tailwindcss'`, `@import 'tw-animate-css'`, the theme token block, and a
  small `@layer` of residual scoped CSS. `planner.css` is progressively emptied and
  deleted at the end of the migration.

### 2. Theme tokens (preserve look)

Map current CSS variables onto shadcn semantic tokens using the Tailwind v4
`@theme` / `:root` approach so components render ~identically to today.

| Current | shadcn token | Value |
|---|---|---|
| `--bg` | `--background` | `#f6f7fb` |
| `--surface` | `--card`, `--popover` | `#ffffff` |
| `--surface-2` | `--muted`, `--secondary` | `#f1f3f9` |
| `--border` | `--border`, `--input` | `#e6e8ef` |
| `--text` | `--foreground` | `#1e2233` |
| `--text-muted` | `--muted-foreground` | `#6b7280` |
| `--accent` | `--primary`, `--ring` | `#6366f1` |
| `--radius` | `--radius` | `14px` (shadcn derives sm/md/lg) |

- Keep `--green` (`#22c55e`), `--yellow` (`#eab308`), red (`#ef4444`), and the soft
  `--shadow` as extra project tokens for tags, event colors, day-rail, and the
  now-line.
- `--primary-foreground` = white; primary hover ≈ `#4f51e0`.
- Font: Inter stays as `--font-sans` (Google Font link retained).
- Scaffold an empty `.dark {}` block for future dark-mode token values. Not built or
  tested now.

### 3. Component mapping (full shadcn)

Install these primitives and rebuild UI on them:

| shadcn primitive | Replaces (planner.css) |
|---|---|
| **Button** (CVA variants) | `.btn` / `.primary` / `.ghost` / `.danger` / `.icon` / `.mini-btn` |
| **Dialog** | `.modal` native `<dialog>` in `AddTaskModal` + `EditTaskModal` |
| **Input / Textarea / Label / Select** | `.field` inputs, selects, `.search` boxes |
| **Card** | `.task`, `.project-card`, `.note-item`, `.note-box`, `.cal-drawer` |
| **Badge** | `.tag`, `.nav-count`, `.note-item-tag` |
| **Checkbox** | `.check` task toggle |
| **Progress** | `.progress` project bars |
| **Skeleton** | `page-pending` shimmer (drops custom keyframes) |
| **Avatar** | `.avatar` |

- **Sidebar/nav, view headers, grids** → plain Tailwind utilities (no heavyweight
  shadcn Sidebar component).
- **Filter chips** (`.chip` / `.filter-chip`) → Button or Toggle variant.
- **Icons** → swap unicode glyphs (`☀ ☰ ▤ ▦ ✎`) for `lucide-react` icons.

### 4. Pragmatic residual CSS

A small scoped block stays, moved into `app.css` under `@layer components` (utilities
would be ugly here):

- Calendar week grid gradient lines (`.cal-grid` repeating-linear-gradient) + column
  borders.
- Day-rail hour lines + `.now-line` marker.
- Absolutely-positioned event blocks' base positioning.

Everything else — spacing, colors, typography, flex/grid — becomes Tailwind
utilities. Target end state: `planner.css` deleted; residual CSS ≈ 40–60 lines in
`app.css`.

## Migration Order

Foundation-first, then view-by-view (`planner.css` shrinks each step):

1. **Foundation** (sections 1–2) + install all primitives + `app.css` wired into
   `__root.tsx`.
2. `AppShell` / `Sidebar`.
3. Modals → `Dialog` (`AddTaskModal`, `EditTaskModal`).
4. `TaskRow` + Today view.
5. Backlog (filter chips → Button/Toggle).
6. Projects (Card + Progress).
7. Notes.
8. Calendar (`WeekView` / `DayRail`) with residual scoped CSS.
9. Sign-in.
10. Cleanup: delete dead `planner.css`, prune unused tokens/vars.

## Verification

- After each step: `npm run lint` (tsc + eslint) + dev-server visual check against
  current design.
- End of migration: `npm test` (vitest) + `npm run test:e2e` (playwright).
- Confirm no FOUC under TanStack Start SSR (CSS linked in head).

## Risks

- **Native `<dialog>` → Radix Dialog:** changes focus/scroll/escape semantics and
  replaces imperative `showModal()`/`close()` with state-driven `open`. The reset
  logic (clearing form state on open) and `onClose` behavior must be carefully
  ported.
- **shadcn CLI assumes `@/`:** we set `~` in `components.json` and verify generated
  imports use `~`; fix any that don't.
- **v4 vs v3 init path:** ensure the v4 flow (`@theme`, `tw-animate-css`,
  cssVariables, no `tailwind.config.js`), not the v3 path.
- **Icon swap:** replacing glyphs with `lucide-react` slightly changes nav visuals;
  pick icons that match the current intent.

## Out of Scope

- Building/testing dark mode (only scaffolding tokens).
- Redesigning any view (this is a like-for-like migration).
- Unrelated refactors beyond what the migration touches.
