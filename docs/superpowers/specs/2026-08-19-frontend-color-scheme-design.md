# Frontend Color Scheme — Design

**Date:** 2026-08-19
**Status:** Proposed
**Amends:** None

## 1. Goal

Replace the current indigo-led frontend palette with a calmer, more focused
neutral "ink" scheme. The new scheme should make the product feel quieter and
more trustworthy while preserving clear visual hierarchy for primary actions,
navigation, status states, and calendar events.

## 2. Chosen direction

The palette anchors the UI on an ink blue-gray primary:

- `--primary: #2F3447`
- `--foreground: #1A1F2E`
- `--background: #F5F6F9`

This keeps the product in a cool neutral family instead of shifting toward
warmer or more playful brand colors.

## 3. Token changes

### 3.1 Core UI tokens

Update the theme tokens in `src/styles/app.css`:

| Token | New value | Purpose |
| --- | --- | --- |
| `--background` | `#F5F6F9` | App canvas |
| `--foreground` | `#1A1F2E` | Main text |
| `--primary` | `#2F3447` | Buttons, links, active navigation, logo mark |
| `--primary-foreground` | `#FFFFFF` | Text on primary surfaces |
| `--secondary` | `#ECEEF3` | Secondary surfaces |
| `--muted` | `#ECEEF3` | Subtle surfaces |
| `--muted-foreground` | `#5C6370` | Supporting text |
| `--accent` | `#E4E7EE` | Hover and selection surfaces |
| `--border` | `#DDE1E9` | Borders and separators |
| `--input` | `#DDE1E9` | Inputs |
| `--ring` | `#2F3447` | Focus ring |

### 3.2 Semantic tokens

Keep semantic colors distinct from brand colors, but slightly mute them so they
fit the calmer palette:

| Token | New value | Purpose |
| --- | --- | --- |
| `--success` | `#209E4F` | Positive state |
| `--warning` | `#B8860B` | Warning state |
| `--destructive` | `#EF4444` | Error and destructive actions |

### 3.3 Calendar event tokens

Decouple event colors from the primary brand token so calendar information stays
scannable after the primary shifts from indigo to neutral:

| Token | New value | Purpose |
| --- | --- | --- |
| `--event-work` | `#1B7F4A` | Task-linked work blocks |
| `--event-personal` | `#4A6FA5` | Personal blocks |
| `--event-google` | `#B8860B` | Google calendar blocks |

## 4. Expected UI effects

- Primary buttons become darker and more grounded.
- Active navigation uses a subtle ink tint instead of a colorful accent wash.
- The sidebar logo and avatar accent shift from indigo to ink.
- Calendar event colors remain differentiated from the neutral UI chrome.
- Workflow status colors in task tables remain unchanged unless a separate pass
  decides to normalize those hardcoded Tailwind utility colors.

## 5. Scope

In scope:

- Update CSS custom properties in `src/styles/app.css`.
- Preserve current component structure and variant usage.

Out of scope:

- Dark mode design.
- Refactoring hardcoded task workflow badge colors.
- Typography, spacing, radius, or shadow changes.

## 6. Risks and mitigations

- **Risk:** A neutral primary can make the app feel too subdued.
  **Mitigation:** Keep calendar event colors distinct and preserve strong text
  contrast.
- **Risk:** Some components may implicitly rely on the current indigo for
  affordance.
  **Mitigation:** Reuse the same token names so interaction hierarchy remains
  intact, then visually verify buttons, nav states, and the calendar rail.

## 7. Verification

After the token update, verify:

- Primary buttons still stand out from card and page surfaces.
- Active navigation remains easy to identify.
- Focus rings remain visible.
- Calendar blocks are still easy to distinguish by type.
