# Frontend Color Scheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved ink-based frontend color palette by updating the shared CSS theme tokens.

**Architecture:** Keep the change constrained to the existing design-token layer in `src/styles/app.css`. Reuse current token names so all button, navigation, form, and calendar styling updates flow through the existing component system without component refactors.

**Tech Stack:** React, TanStack Start, Tailwind CSS v4 theme tokens, CSS custom properties

## Global Constraints

- Update only theme tokens needed to implement the approved ink palette.
- Keep component structure and variant usage unchanged.
- Keep dark mode untouched.
- Keep workflow-specific hardcoded task badge colors unchanged.
- Do not create a git commit unless the user explicitly asks for one.

---

### Task 1: Update Theme Tokens

**Files:**
- Modify: `src/styles/app.css`
- Verify: `src/styles/app.css`

**Interfaces:**
- Consumes: Existing CSS custom properties under `:root` in `src/styles/app.css`
- Produces: Updated token values for `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--success`, `--warning`, `--event-work`, `--event-personal`, and `--event-google`

- [ ] **Step 1: Update the core UI tokens in `src/styles/app.css`**

```css
:root {
  --background: #f5f6f9;
  --foreground: #1a1f2e;
  --primary: #2f3447;
  --secondary: #eceef3;
  --muted: #eceef3;
  --muted-foreground: #5c6370;
  --accent: #e4e7ee;
  --border: #dde1e9;
  --input: #dde1e9;
  --ring: #2f3447;
}
```

- [ ] **Step 2: Update the semantic and calendar event tokens in `src/styles/app.css`**

```css
:root {
  --success: #209e4f;
  --warning: #b8860b;
  --event-work: #1b7f4a;
  --event-personal: #4a6fa5;
  --event-google: #b8860b;
}
```

- [ ] **Step 3: Verify the final token block matches the approved design**

Run: visually inspect `src/styles/app.css`
Expected: the file contains the approved ink palette values and no unrelated changes

- [ ] **Step 4: Run lint diagnostics for the edited file**

Run: IDE lint diagnostics on `src/styles/app.css`
Expected: no new diagnostics
