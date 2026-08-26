# Clerk Best-Practices Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the existing Clerk + Convex auth implementation with Clerk’s TanStack Start / React / custom-ui best practices without changing the product model (Clerk subjects as `userId`, optional Google Calendar via Clerk OAuth, `useConvexAuth` for data gates).

**Architecture:** Move from client-only `@clerk/react` wrapping in `router.tsx` to the official TanStack Start + Convex pattern: `@clerk/tanstack-react-start` (middleware + server `auth()`), root `beforeLoad` that stamps the Clerk JWT onto Convex’s SSR HTTP client, `ConvexProviderWithClerk` in the root component tree, and a slim client `AuthGate` that still waits for Convex JWT acceptance. UI polish uses Clerk’s shadcn theme and `<UserButton />`. Backend token fetch uses `@clerk/backend` instead of hand-rolled `fetch`.

**Tech Stack:** `@clerk/tanstack-react-start`, `@clerk/backend`, `@clerk/themes` (Core 2) or `@clerk/ui` (if upgrading to current SDK), `convex/react-clerk`, existing TanStack Start (`@tanstack/react-start` Vite plugin), Vitest.

## Global Constraints

- Spec / prior work: `docs/superpowers/specs/2026-08-26-clerk-auth-design.md` and `docs/superpowers/plans/2026-08-26-clerk-auth.md` (already implemented on `feature/clerk-auth`)
- Skills to follow: `clerk-tanstack-patterns`, `clerk-react-patterns`, `clerk-setup`, `clerk-custom-ui`, plus Convex guide https://docs.convex.dev/client/tanstack/tanstack-start/clerk
- Keep ownership as Clerk `identity.subject` strings; no Convex `users` table; no Google tokens stored in Convex
- Calendar scope remains `https://www.googleapis.com/auth/calendar`; global Google SSO stays identity-only
- Data-path auth gates must continue to use `useConvexAuth()` from `convex/react` (not Clerk `useAuth` alone) after Convex is ready
- Never remove the Clerk-signed-in / Convex-JWT-rejected escape hatch (prevents `/sign-in` ↔ `/today` loops)
- Commit only when the user asked to commit; if they have not, skip every Commit step
- Work in the existing `feature/clerk-auth` worktree (`AGENTS.md` / `using-git-worktrees`); do not create a second tree unless the branch is already merged
- Before Convex deploy-affecting commands, follow `convex-deploy-guard`
- Do not delete `convex/migrateClerkUser.ts` in this plan unless the user confirms migration is done and asks to remove it

## Current state (baseline for the implementing agent)

| Area | Current behavior |
|---|---|
| Package | `@clerk/react@^6.14.7` (Core 2); no `@clerk/tanstack-react-start` |
| Providers | `ClerkConvexWrap` in `src/router.tsx` `Wrap` |
| Route guard | Client `AuthGate` in `src/routes/_authenticated.tsx` |
| Sign-in/up | Prebuilt `<SignIn />` / `<SignUp />` + splat routes; `forceRedirectUrl="/today"` |
| Profile | Hand-rolled avatar + `useClerk().signOut()` in `AppShell` |
| Theme | No Clerk `appearance` / shadcn theme despite `components.json` |
| Tokens | `convex/google/clerkTokens.ts` raw `fetch` to Clerk Backend API |
| Start middleware | No `src/start.ts` / `clerkMiddleware` |

## File structure

| File | Responsibility |
|---|---|
| `package.json` | Swap/add Clerk Start + backend + themes packages |
| `src/start.ts` | `createStart` + `clerkMiddleware()` (required for server `auth()`) |
| `.env.local` | Add `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` aliases if Start SDK requires unprefixed names (keep `VITE_` for client) |
| `src/router.tsx` | Expose `convexClient` + `convexQueryClient` on router context; stop nesting Clerk in `Wrap` (move to root) |
| `src/routes/__root.tsx` | `ClerkProvider` + `ConvexProviderWithClerk` + root `beforeLoad` token handoff |
| `src/routes/_authenticated.tsx` | Optional thin `beforeLoad` redirect when no Clerk `userId`; keep client `AuthGate` for Convex readiness |
| `src/components/auth/ClerkConvexWrap.tsx` | Delete after providers move to root (or shrink to unused) |
| `src/components/auth/AuthGate.tsx` | Convex wait + JWT-failure UI only; extract shared failure panel |
| `src/components/auth/ClerkJwtFailure.tsx` | Shared “signed in to Clerk, Convex rejected JWT” UI |
| `src/components/auth/AuthScreen.tsx` | Use shared failure panel; honor `redirect` search param |
| `src/components/layout/AppShell.tsx` | `<UserButton />` instead of custom sign-out/avatar block |
| `src/lib/authRedirect.ts` | Pure helpers for redirect search param parse/build |
| `convex/google/clerkTokens.ts` | Prefer `@clerk/backend` client; keep parser + tests |
| `src/styles/app.css` | Import Clerk shadcn theme CSS |

---

### Task 1: shadcn theme on ClerkProvider

**Files:**
- Modify: `src/components/auth/ClerkConvexWrap.tsx` (temporary — Task 2 moves provider; still apply theme here first so UI improves immediately)
- Modify: `src/styles/app.css`
- Modify: `package.json` (via npm install)

**Interfaces:**
- Consumes: existing `ClerkProvider`
- Produces: Clerk UI matches shadcn design tokens

- [ ] **Step 1: Install themes package for Core 2**

Because the app is on `@clerk/react@6` (Core 2), install:

```bash
npm install @clerk/themes
```

(If Task 2 upgrades to current Start SDK that expects `@clerk/ui`, switch import paths in that task.)

- [ ] **Step 2: Import theme CSS**

In `src/styles/app.css`, add after existing Tailwind imports:

```css
@import '@clerk/themes/shadcn.css';
```

- [ ] **Step 3: Apply appearance on ClerkProvider**

In `ClerkConvexWrap.tsx`:

```tsx
import { ClerkProvider, useAuth } from '@clerk/react'
import { shadcn } from '@clerk/themes'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
// ...

return (
  <ClerkProvider
    publishableKey={publishableKey}
    appearance={{ theme: shadcn }}
  >
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  </ClerkProvider>
)
```

- [ ] **Step 4: Manual verify**

Run: `npm run dev` → open `/sign-in`

Expected: Clerk form uses app-like shadcn styling (not default purple stock look).

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add package.json package-lock.json src/components/auth/ClerkConvexWrap.tsx src/styles/app.css
git commit -m "Apply Clerk shadcn theme to match the app design system."
```

---

### Task 2: Adopt `@clerk/tanstack-react-start` + middleware

**Files:**
- Modify: `package.json`
- Create: `src/start.ts`
- Modify: `.env.local` (local only; do not commit secrets)
- Modify: `src/router.tsx`
- Modify: `src/routes/__root.tsx`
- Delete: `src/components/auth/ClerkConvexWrap.tsx` (after providers move)
- Update imports: `AuthGate.tsx`, `AuthScreen.tsx`, `AppShell.tsx`, `ConnectGoogleCalendar.tsx` from `@clerk/react` → `@clerk/tanstack-react-start` where hooks/components live

**Interfaces:**
- Consumes: `CLERK_PUBLISHABLE_KEY` (and/or `VITE_CLERK_PUBLISHABLE_KEY`), `CLERK_SECRET_KEY` for server
- Produces: Server `auth()` works; `useAuth` from Start SDK passed to `ConvexProviderWithClerk`

- [ ] **Step 1: Install Start SDK; remove direct `@clerk/react` if Start re-exports it**

```bash
npm install @clerk/tanstack-react-start
# Keep @clerk/react only if Start does not re-export SignIn/SignUp/useAuth.
# Prefer a single package: @clerk/tanstack-react-start.
npm uninstall @clerk/react
```

If uninstall breaks types, leave `@clerk/react` as a transitive peer and import only from `@clerk/tanstack-react-start`.

- [ ] **Step 2: Env aliases**

In `.env.local` (do not commit), ensure both forms exist if Start middleware reads unprefixed names:

```bash
CLERK_PUBLISHABLE_KEY=<same as VITE_CLERK_PUBLISHABLE_KEY>
CLERK_SECRET_KEY=<already on Convex; also needed in .env.local for Start server auth()>
```

Keep `VITE_CLERK_PUBLISHABLE_KEY` if any client code still reads it; prefer Start’s `ClerkProvider` with no explicit key when env is set.

- [ ] **Step 3: Create `src/start.ts`**

```ts
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createStart } from '@tanstack/react-start'

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [clerkMiddleware()],
  }
})
```

If the installed `@tanstack/react-start` version does not export `createStart` / rejects this file, WebFetch the current Clerk TanStack quickstart and Convex TanStack Start + Clerk page and adapt — do not invent a parallel middleware. Record the chosen Start version APIs in the task report.

- [ ] **Step 4: Restructure `getRouter` context**

Modify `src/router.tsx` so router context includes Convex clients (needed by root `beforeLoad`), and **remove** `ClerkConvexWrap` from `Wrap`. Prefer Convex docs pattern:

```tsx
import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexReactClient } from 'convex/react'
import { routeTree } from './routeTree.gen'
import { PagePending } from '~/components/layout/PagePending'

export function getRouter() {
  const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL!
  if (!CONVEX_URL) {
    throw new Error('missing VITE_CONVEX_URL')
  }

  const convex = new ConvexReactClient(CONVEX_URL, {
    unsavedChangesWarning: false,
  })
  const convexQueryClient = new ConvexQueryClient(convex)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        gcTime: 5000,
      },
    },
  })
  convexQueryClient.connect(queryClient)

  const router = routerWithQueryClient(
    createRouter({
      routeTree,
      defaultPreload: 'intent',
      context: {
        queryClient,
        convexClient: convex,
        convexQueryClient,
      },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
      defaultPendingComponent: PagePending,
      defaultErrorComponent: (err) => <p>{err.error.stack}</p>,
      defaultNotFoundComponent: () => <p>not found</p>,
      // No Clerk wrap here — providers live in __root.tsx
    }),
    queryClient,
  )

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

Preserve `routerWithQueryClient` if removing it breaks existing query integration; only change provider placement and context shape.

- [ ] **Step 5: Root route — server token handoff + providers**

Rewrite `src/routes/__root.tsx` following Convex’s TanStack Start + Clerk guide (adapt to this app’s head/meta, drop template nav links):

```tsx
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router'
import {
  ClerkProvider,
  useAuth,
} from '@clerk/tanstack-react-start'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexReactClient } from 'convex/react'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import { shadcn } from '@clerk/themes'
import appCss from '~/styles/app.css?url'

const fetchClerkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const { userId, getToken } = await auth()
  const token = await getToken({ template: 'convex' }).catch(() => null)
  return { userId, token }
})

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  convexClient: ConvexReactClient
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Life Planner' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  beforeLoad: async (ctx) => {
    const { userId, token } = await fetchClerkAuth()
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)
    }
    return { userId, token }
  },
  component: RootComponent,
})

function RootComponent() {
  const context = useRouteContext({ from: Route.id })
  return (
    <ClerkProvider appearance={{ theme: shadcn }}>
      <ConvexProviderWithClerk client={context.convexClient} useAuth={useAuth}>
        <RootDocument>
          <Outlet />
        </RootDocument>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

Notes:
- If `getToken({ template: 'convex' })` fails because the Convex integration already sets `aud: "convex"` on the default session token, fall back to `getToken()` with no template (match `ConvexProviderWithClerk` logic).
- Re-apply shadcn theme here; remove theme from deleted `ClerkConvexWrap`.

- [ ] **Step 6: Fix all `@clerk/react` imports**

Grep and replace app imports:

```bash
rg -n "@clerk/react" src
```

Point hooks/components at `@clerk/tanstack-react-start`.

- [ ] **Step 7: Delete `ClerkConvexWrap.tsx`**

Remove the file and any remaining imports.

- [ ] **Step 8: Verify**

```bash
npm test
scripts/with-node.sh npx tsc --noEmit
npm run dev
```

Expected: App boots; Google/password sign-in still works; Convex queries authenticate (`useConvexAuth().isAuthenticated === true` after login).

- [ ] **Step 9: Commit** (only if user asked)

```bash
git add package.json package-lock.json src/start.ts src/router.tsx src/routes/__root.tsx src/components/auth src/components/layout/AppShell.tsx
git commit -m "Adopt Clerk TanStack Start SDK with server auth middleware."
```

---

### Task 3: Authenticated layout `beforeLoad` + slim AuthGate

**Files:**
- Create: `src/components/auth/ClerkJwtFailure.tsx`
- Modify: `src/components/auth/AuthGate.tsx`
- Modify: `src/components/auth/AuthScreen.tsx`
- Modify: `src/routes/_authenticated.tsx`
- Create: `src/lib/authRedirect.ts`
- Create: `src/lib/authRedirect.test.ts`
- Modify: sign-in/up screens to read `redirect` search param

**Interfaces:**
- Consumes: root `context.userId` from Task 2 `beforeLoad`
- Produces: `getSafeRedirectPath(search: string | undefined): string` → defaults `/today`

- [ ] **Step 1: Write redirect helper tests**

```ts
// src/lib/authRedirect.test.ts
import { describe, expect, it } from 'vitest'
import { getSafeRedirectPath, buildSignInSearch } from './authRedirect'

describe('getSafeRedirectPath', () => {
  it('defaults to /today', () => {
    expect(getSafeRedirectPath(undefined)).toBe('/today')
    expect(getSafeRedirectPath('')).toBe('/today')
  })

  it('allows same-origin relative paths', () => {
    expect(getSafeRedirectPath('/projects')).toBe('/projects')
  })

  it('rejects open redirects', () => {
    expect(getSafeRedirectPath('https://evil.example')).toBe('/today')
    expect(getSafeRedirectPath('//evil.example')).toBe('/today')
  })
})

describe('buildSignInSearch', () => {
  it('omits redirect when path is /today', () => {
    expect(buildSignInSearch('/today')).toEqual({})
  })

  it('includes redirect for other paths', () => {
    expect(buildSignInSearch('/projects')).toEqual({ redirect: '/projects' })
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- src/lib/authRedirect.test.ts
```

- [ ] **Step 3: Implement helper**

```ts
// src/lib/authRedirect.ts
const DEFAULT_PATH = '/today'

export function getSafeRedirectPath(redirect: string | undefined): string {
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return DEFAULT_PATH
  }
  return redirect
}

export function buildSignInSearch(pathname: string): { redirect?: string } {
  if (!pathname || pathname === DEFAULT_PATH) return {}
  return { redirect: pathname }
}
```

- [ ] **Step 4: Extract `ClerkJwtFailure`**

```tsx
// src/components/auth/ClerkJwtFailure.tsx
import { SignOutButton } from '@clerk/tanstack-react-start'
import { Button } from '~/components/ui/button'

export function ClerkJwtFailure() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-sm text-foreground">
        You’re signed in with Clerk, but Convex could not verify the session JWT.
      </p>
      <p className="text-xs text-muted-foreground">
        Confirm the Clerk Convex integration (JWT template{' '}
        <code className="rounded bg-muted px-1">convex</code>) and{' '}
        <code className="rounded bg-muted px-1">CLERK_JWT_ISSUER_DOMAIN</code> on
        the Convex deployment.
      </p>
      <SignOutButton>
        <Button type="button" variant="outline" size="sm">
          Sign out and try again
        </Button>
      </SignOutButton>
    </div>
  )
}
```

Use it from both `AuthGate` and `AuthScreen`.

- [ ] **Step 5: `_authenticated` beforeLoad**

```tsx
// src/routes/_authenticated.tsx
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AuthGate } from '~/components/auth/AuthGate'
import { AppShell } from '~/components/layout/AppShell'
import { buildSignInSearch } from '~/lib/authRedirect'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    // Server/Clerk session from root beforeLoad — not a Convex gate.
    if (!context.userId) {
      throw redirect({
        to: '/sign-in',
        search: buildSignInSearch(location.pathname),
      })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <AuthGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGate>
  )
}
```

Extend root route context typing so `userId` is available on child routes (already returned from root `beforeLoad` in Task 2).

- [ ] **Step 6: Wire SignIn/SignUp redirect search**

Validate search on sign-in/up routes (zod or TanStack validateSearch):

```ts
search: (raw: Record<string, unknown>) => ({
  redirect: typeof raw.redirect === 'string' ? raw.redirect : undefined,
}),
```

In `AuthScreen` / `SignInScreen`, when Convex-authenticated:

```tsx
const { redirect } = Route.useSearch()
return <Navigate to={getSafeRedirectPath(redirect)} replace />
```

Pass `forceRedirectUrl={getSafeRedirectPath(redirect)}` into `<SignIn />` / `<SignUp />` (still absolute path only).

- [ ] **Step 7: Tests + smoke**

```bash
npm test -- src/lib/authRedirect.test.ts
npm test
```

Manual: visit `/projects` while signed out → land on sign-in → after login return to `/projects`.

- [ ] **Step 8: Commit** (only if user asked)

```bash
git add src/lib/authRedirect.ts src/lib/authRedirect.test.ts src/components/auth src/routes/_authenticated.tsx src/routes/sign-in.* src/routes/sign-up.*
git commit -m "Add beforeLoad auth redirect and safe post-login return paths."
```

---

### Task 4: Replace custom profile with `<UserButton />`

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `@clerk/tanstack-react-start` `UserButton`
- Produces: same Connect Google Calendar UX; Clerk-managed account menu

- [ ] **Step 1: Replace footer avatar / sign-out block**

Remove `useClerk().signOut`, manual `Avatar`, and the Sign out button. Render:

```tsx
import { UserButton } from '@clerk/tanstack-react-start'

// inside sidebar footer, after ConnectGoogleCalendar:
<div className="mt-1 flex items-center gap-2.5 border-t border-border px-3 py-2.5">
  <UserButton
    appearance={{
      elements: {
        rootBox: 'flex w-full',
        userButtonTrigger: 'rounded-md',
      },
    }}
  />
</div>
```

Keep Google status + `ConnectGoogleCalendar` above it. Drop unused `LogOut` import / initials helpers if unused.

- [ ] **Step 2: Manual verify**

Sign in → open UserButton → account / sign out works; Google connect still visible.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add src/components/layout/AppShell.tsx
git commit -m "Use Clerk UserButton for account management in the shell."
```

---

### Task 5: Fetch Google tokens via `@clerk/backend`

**Files:**
- Modify: `package.json`
- Modify: `convex/google/clerkTokens.ts`
- Modify: `convex/google/clerkTokens.test.ts` (keep parser tests; add client-wrapper test if extracting)

**Interfaces:**
- Consumes: `CLERK_SECRET_KEY`
- Produces: same `fetchClerkGoogleAccessToken(clerkUserId): Promise<ClerkGoogleToken | null>`

- [ ] **Step 1: Install**

```bash
npm install @clerk/backend
```

- [ ] **Step 2: Rewrite fetch using official client**

Keep `parseClerkOAuthTokens` for unit tests / resilience. Prefer SDK call when available:

```ts
import { createClerkClient } from '@clerk/backend'

export async function fetchClerkGoogleAccessToken(
  clerkUserId: string,
): Promise<ClerkGoogleToken | null> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) {
    console.error('CLERK_SECRET_KEY is not set')
    return null
  }

  try {
    const clerk = createClerkClient({ secretKey: secret })
    // Use the SDK method available in the installed version.
    // Prefer getUserOauthAccessToken / equivalent; if the SDK returns
    // { data }, pass data through parseClerkOAuthTokens.
    const result = await clerk.users.getUserOauthAccessToken(
      clerkUserId,
      'oauth_google',
    )
    const parsed = parseClerkOAuthTokens(result)
    if (parsed) return parsed
    // Some SDK versions return { data: Token[] }
    return parseClerkOAuthTokens(
      'data' in (result as object) ? result : { data: result },
    )
  } catch (error) {
    console.error('Clerk oauth_access_tokens request failed', error)
    return null
  }
}
```

Verify exact method names against installed `@clerk/backend` typings; adjust rather than inventing. Prefer selecting the entry whose scopes include `https://www.googleapis.com/auth/calendar` when multiple tokens exist (update `parseClerkOAuthTokens` or add `pickClerkGoogleToken`).

- [ ] **Step 3: Extend parser tests for calendar-preferring selection**

```ts
it('prefers the calendar-scoped token when multiple entries exist', () => {
  const picked = parseClerkOAuthTokens([
    { token: 'no-scope', scopes: [] },
    {
      token: 'cal',
      scopes: ['https://www.googleapis.com/auth/calendar'],
    },
  ])
  expect(picked?.token).toBe('cal')
})
```

- [ ] **Step 4: Run tests**

```bash
npm test -- convex/google/clerkTokens.test.ts convex/google/tokenDecision.test.ts convex/sync.test.ts
npm test
```

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add package.json package-lock.json convex/google/clerkTokens.ts convex/google/clerkTokens.test.ts
git commit -m "Load Google OAuth tokens through @clerk/backend."
```

---

### Task 6: Full verify + optional cleanup notes

**Files:** none required (verification); optional docs touch only if env naming changed

- [ ] **Step 1: Full suite**

```bash
npm test
scripts/with-node.sh npx tsc --noEmit
npm run build
```

Expected: tests + tsc + build pass. Repo-wide lint may still fail on pre-existing unrelated UI debt — do not expand scope to fix unrelated lint unless trivial.

- [ ] **Step 2: Manual checklist**

- [ ] Email/password sign-in/up (shadcn look)
- [ ] Google SSO → `/today` (or prior `redirect`)
- [ ] Soft navigation to `/projects` while signed out → sign-in → back to `/projects`
- [ ] UserButton account menu + sign out
- [ ] Connect / disconnect Google Calendar still works
- [ ] No `/sign-in` ↔ `/today` loop when JWT misconfigured (failure panel)

- [ ] **Step 3: Document leftover human ops (do not delete unless asked)**

Leave `convex/migrateClerkUser.ts` until user confirms. Note in PR/summary: delete migration module after verified production/local remap.

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add -A
git commit -m "Verify Clerk best-practice alignment across Start, UI, and tokens."
```

---

## Spec / review coverage

| Improvement from skill review | Task |
|---|---|
| shadcn theme (`clerk-custom-ui` / `clerk-setup`) | 1 |
| `@clerk/tanstack-react-start` + `clerkMiddleware` | 2 |
| Root `beforeLoad` + Convex SSR `setAuth` (Convex docs) | 2 |
| `beforeLoad` layout guard (`clerk-tanstack-patterns`) | 3 |
| Safe return URL after sign-in | 3 |
| Shared JWT failure UI (keep anti-loop) | 3 |
| `<UserButton />` | 4 |
| `@clerk/backend` for OAuth tokens | 5 |
| Prefer calendar-scoped token entry | 5 |
| Full verify | 6 |

## Out of scope (explicit)

- Upgrading `@clerk/*` from Core 2 (v6) to current v7+ unless required by `@clerk/tanstack-react-start` peer deps — if peers force upgrade, do it inside Task 2 and switch theme imports to `@clerk/ui`
- Organizations / billing / webhooks
- Deleting `migrateClerkUser` without user confirmation
- Fixing pre-existing unrelated ESLint failures outside touched files

## Placeholder / consistency notes

- Calendar scope string: `https://www.googleapis.com/auth/calendar`
- Default post-login path: `/today`
- Convex data gate: `useConvexAuth()` remains authoritative for rendering authenticated app chrome that loads Convex data
- Clerk session gate: root/`_authenticated` `beforeLoad` uses Clerk `userId` for early redirect only
