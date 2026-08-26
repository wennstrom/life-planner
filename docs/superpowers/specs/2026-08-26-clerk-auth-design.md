# Clerk Authentication Design

**Date:** 2026-08-26  
**Status:** Approved for planning

## Goal

Replace Convex Auth with **Clerk** for sign-up, sign-in, and session management. Support Clerk’s default methods (email/password plus social, including Google). Make **Google Calendar sync optional** and fully owned by Clerk’s Google OAuth tokens — not requested at login.

## Decisions

| Topic | Choice |
| --- | --- |
| Auth provider | Clerk |
| Sign-in UI | Clerk prebuilt `<SignIn />` / `<SignUp />` |
| Account methods | Clerk defaults (password + Google + dashboard-enabled methods) |
| Calendar at login | No — identity scopes only |
| Calendar connect | Optional later via Clerk Google reauthorize / link |
| Token storage | Clerk Backend API; Convex does not store Google access/refresh tokens |
| Convex `users` table | **Removed**; ownership keyed by Clerk user id string |
| Existing data | Migrate FKs from legacy Convex Auth user id → Clerk id (single user) |
| Temp migration artifacts | Delete after the one-shot remapping |

## Architecture

```
┌─────────────┐     JWT      ┌─────────────┐
│ Clerk       │─────────────▶│ Convex      │
│ SignIn/Up   │              │ auth.config │
│ Google SSO  │              │ (validate)  │
└──────┬──────┘              └──────┬──────┘
       │                            │
       │ reauthorize                │ identity.subject
       │ (calendar scopes)          │ as userId: string
       ▼                            ▼
┌─────────────┐              ┌─────────────┐
│ Clerk       │  get token   │ Domain data │
│ OAuth store │◀─────────────│ + googleAccounts │
└─────────────┘   (action)   │   (metadata)│
                             └─────────────┘
```

### Frontend

- Wrap the app with `ClerkProvider` and `ConvexProviderWithClerk`.
- `/sign-in` (and `/sign-up` if routed separately) render Clerk prebuilt components.
- `/_authenticated` `AuthGate` continues to use `useConvexAuth()` so UI waits for a Convex-valid JWT.
- Unauthenticated users redirect to `/sign-in`; post-login redirect remains `/today`.
- Shell sign-out uses Clerk (`SignOutButton` or `useClerk().signOut()`).
- Sidebar shows Google calendar connection state and a **Connect Google Calendar** control when disconnected.

### Backend identity

- `convex/auth.config.ts` validates Clerk JWTs (issuer from Clerk Convex integration).
- Remove `@convex-dev/auth`, `convex/auth.ts` Google provider, and auth HTTP callback wiring owned by Convex Auth.
- Auth helpers (`requireUserId` / optional viewer) use `ctx.auth.getUserIdentity()` and return `identity.subject` as `string`.
- All domain tables use `userId: v.string()` (Clerk id) with the same indexes renamed/retained by field name.

### No Convex `users` table

Clerk is the source of truth for profile and credentials. Convex does not maintain a parallel user document. Queries that today join `users` + `googleAccounts` return Clerk-facing fields from the client where needed, and `googleConnected` from Convex sync metadata / token presence checks.

## Optional Google Calendar

### Connect flow

1. User is already signed in with Clerk (any method).
2. **Connect Google Calendar** triggers Clerk Google account link (if needed) and `ExternalAccount.reauthorize` with calendar scopes (e.g. `https://www.googleapis.com/auth/calendar`).
3. Global Clerk Google SSO settings stay **identity-only** so login never asks for calendar.
4. On success, ensure a `googleAccounts` row exists for that Clerk `userId` (metadata only) and kick off the existing inbound sync scheduler path.

### Disconnect

- Clear Convex sync metadata for that user (sync token, watch channel fields) and cancel watches where applicable.
- Treat missing/invalid Clerk Google+calendar token as disconnected.
- Actual OAuth revocation remains with Google/Clerk; the app does not keep refresh tokens to revoke locally.

### Token path (sync)

Replace the current refresh-token loop in `getValidAccessToken` with:

1. Resolve Clerk user id for the Convex `userId` (they are the same string after migration).
2. Convex **action** calls Clerk Backend API `getUserOauthAccessToken(userId, "oauth_google")` using `CLERK_SECRET_KEY`.
3. Verify calendar scope (existing tokeninfo / scope checks can remain as a safety net).
4. Pass the access token into the existing Google Calendar client.
5. If no token or missing calendar scope → return `null`; inbound/outbound/watch soft-fail as today.

### `googleAccounts` schema

| Field | Action |
| --- | --- |
| `userId` | `v.string()` (Clerk id) |
| `accessToken` | **Remove** |
| `refreshToken` | **Remove** |
| `tokenExpiry` | **Remove** |
| `calendarSyncToken` | Keep |
| `watchChannelId` / `watchResourceId` / `watchExpiry` | Keep |

`googleConnected` means: Clerk has a Google OAuth token with calendar scopes (and/or a `googleAccounts` metadata row after a successful connect). Prefer checking Clerk token availability in the viewer/connect status path rather than “row exists with refresh token.”

### Email/password users

Connecting calendar requires linking a Google account through Clerk, then reauthorizing with calendar scopes. Google-login users only need the additional-scope reauthorize.

## Data migration (single user)

1. Record the current Convex Auth user’s **email** and **legacy `userId`**.
2. Create/sign in to Clerk with that **same email**.
3. One-shot rewrite: every row in `projects`, `tasks`, `timeBlocks`, `notes`, `dayRecords`, and `googleAccounts` with the legacy id → Clerk `user_…` id; strip token fields from `googleAccounts`.
4. Remove Convex Auth tables (`authTables` / `users` / sessions / accounts / etc.) after auth cutover.
5. Delete any temporary legacy-mapping table or script artifact after the rewrite succeeds.
6. **Re-connect Google Calendar** via Clerk — legacy Google refresh tokens are not imported into Clerk.

If email does not match, data would not remapped automatically; for this deployment there is only one user and email will be matched deliberately.

## Error handling

| Case | Behavior |
| --- | --- |
| No Convex identity | Throw `"Not authenticated"` from protected functions |
| Calendar sync, no Clerk calendar token | Soft-fail: skip sync, `googleConnected: false` |
| User denies Google calendar consent | Remain disconnected; short message on connect control |
| Clerk API token fetch failure | Log and return `null` from token action (same as missing account today) |

## Testing

- Convex tests: `withIdentity({ subject: "user_test…" })`; all fixtures use string `userId`.
- Cover ownership checks, viewer `googleConnected`, token-fetch failure → sync skipped.
- Manual: Clerk sign-up/sign-in, Google SSO, full app use **without** calendar, then connect calendar and confirm inbound/outbound still work.

## Out of scope

- Multi-user migration tooling
- Custom headless Clerk forms
- Changing calendar conflict / sync semantics
- Non-Google calendar providers
- Importing legacy Google refresh tokens into Clerk

## Risks

| Risk | Mitigation |
| --- | --- |
| Background sync depends on Clerk API | Soft-fail + logging; secrets only in Convex env |
| Email/password users must link Google for calendar | Explicit connect UX; never block core app |
| Schema cutover breaks tests/fixtures | Update `convex-test` identities and seed helpers in the same change |
| Re-connect required after migration | Documented; expected for single-user cutover |

## Human setup (Clerk dashboard)

- Create Clerk application; enable Convex integration; copy Frontend API URL / JWT issuer into Convex env.
- Set `VITE_CLERK_PUBLISHABLE_KEY` (and `CLERK_SECRET_KEY` for Convex actions that fetch OAuth tokens).
- Enable email/password and Google SSO; **do not** attach calendar scopes to the global Google provider.
- Configure allowed redirect URLs for the Vite app origin.
