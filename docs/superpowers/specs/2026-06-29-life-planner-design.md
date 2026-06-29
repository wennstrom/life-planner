# Life Planner — Design

**Date:** 2026-06-29
**Status:** Approved (design phase)

## 1. Overview

A personal, cloud-hosted daily life planner. Single user, accessed from any device via a login. The UI is a sectioned sidebar workspace with five areas: **Today**, **Backlog**, **Projects**, **Calendar**, and **Notes**. Time blocks created in the app sync two-way with the user's primary Google Calendar.

### Goals
- One place to plan a day: pull tasks into Today, time-block them, take notes, track projects.
- Two-way Google Calendar sync so the plan is visible on all devices.
- Live, reactive UI — changes reflect instantly across sections.

### Non-goals (YAGNI)
- Multi-user / sharing / collaboration.
- Mobile native apps (responsive web is enough).
- Calendar providers other than Google.
- Recurring-task engine beyond what Google Calendar provides for events.

## 2. Architecture

| Concern | Choice |
| --- | --- |
| Frontend / full-stack | **TanStack Start** (React, SSR; Router + Query built in) |
| Backend / database | **Convex** (reactive DB, server functions, scheduled jobs, file storage) |
| Auth | **Convex Auth** with the **Google OAuth provider** |
| External integration | **Google Calendar API**, called only from Convex actions |
| Hosting | Convex hosts the backend; TanStack Start frontend deploys to Vercel/Netlify (or Convex hosting) |

**Principles:**
- All Google API calls happen inside Convex **actions** (server-side). OAuth tokens never reach the browser.
- Convex reactivity drives live UI updates (e.g., completing a task updates Today and the project view at once).
- A single Google consent flow grants both sign-in and the calendar scope.

## 3. Data model (Convex tables)

- **users** — managed by Convex Auth (Google profile).
- **googleAccounts** — `userId`, `accessToken`, `refreshToken`, `tokenExpiry`, `calendarSyncToken`, `watchChannel` (id, resourceId, expiry). Server-only.
- **projects** — `name`, `description`, `color`, `status` (active | archived), `order`.
- **tasks** — `title`, `notes?`, `projectId?`, `status` (backlog | today | done), `scheduledDate?`, `dueDate?`, `priority?`, `order`, `completedAt?`.
  - **Backlog** = tasks with no `scheduledDate`.
  - **Today** = tasks where `scheduledDate == today` (or `status == today`).
- **timeBlocks** — `title`, `start`, `end`, `taskId?`, `googleEventId?`, `origin` (app | google), `syncState` (synced | pending | error), `lastSyncedAt`.
- **notes** — `title`, `body` (markdown/rich text), `projectId?`, `taskId?` (null on both = standalone), `updatedAt`.

**Relationships:** task → optional project; timeBlock → optional task; note → optional project *or* task. All records owned by the single user.

**Time blocks as source of truth:** app-created blocks are mirrored to Google and store the returned `googleEventId`. Events created elsewhere are pulled into `timeBlocks` with `origin: google` so the Calendar view shows the real day.

## 4. Google Calendar two-way sync

**Scope:** `https://www.googleapis.com/auth/calendar.events`, requested during Google sign-in. Refresh token stored in `googleAccounts` so Convex can sync while the user is offline.

**App → Google (outbound):**
1. A mutation writes the time block locally with `syncState: pending`.
2. It schedules an action that calls the Calendar API (insert/update/delete).
3. On success, store `googleEventId` and set `syncState: synced`.
4. On failure, set `syncState: error` and retry with backoff.

**Google → App (inbound):** two layers for reliability —
1. **Incremental sync** using a stored `syncToken` (fetches only changes); a scheduled Convex cron runs it periodically.
2. **Push notifications** via Calendar `watch` channels → an HTTP action triggers an immediate incremental sync. Channels auto-renew before expiry.

**Conflict handling:** Google is authoritative for `origin: google` events; app-owned blocks use last-write-wins keyed on the `updated` timestamp. Deletions propagate both ways.

## 5. Sections / features

- **Today:** derived task list for today + today's schedule rail; drag a task onto the rail to time-block it (creates a Google event); quick-note box.
- **Backlog:** all unscheduled tasks, groupable/filterable by project; "send to Today" sets `scheduledDate`.
- **Projects:** project list + project detail (its tasks and attached notes); color + archive.
- **Calendar:** day/week timeline of `timeBlocks`; create/drag/resize → syncs to Google; shows Google-originated events too.
- **Notes:** standalone notebook plus notes attached to a project or task; markdown editor.
- **Auth:** Convex Auth (Google only); routes guarded; sign-in screen for unauthenticated users.

## 6. Testing strategy

- **Convex function tests** (`convex-test`): task/project/note mutations and the derived Today/Backlog queries.
- **Sync tests** with a mocked Google Calendar client: outbound insert/update/delete, inbound incremental merge, conflict resolution, token refresh.
- **Component/e2e smoke tests** for core flows: add task → schedule to Today → time-block → appears on Calendar.

## 7. UI direction

Sectioned sidebar workspace (Notion/Todoist-style). The Today page is the daily driver: left column = Today's Todo (checkable tasks, project tags, quick note), right column = today's schedule rail with app blocks and Google-sourced events, with drag-to-block. Wireframe approved during brainstorming.
