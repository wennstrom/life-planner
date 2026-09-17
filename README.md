# Planner

A personal life planner for turning work into **projects**, **tasks**, and **time blocks**. Sign in, then spend most of your time on **Today**: set an intention, schedule the day, and shut it down with a review.

Signed-in pages live behind Clerk auth. The sidebar (desktop) or bottom nav (mobile) is Today, Backlog, Projects, and Calendar.

## How to use it

A typical loop:

1. **Sign in** at `/sign-in` (or create an account at `/sign-up`). You land on **Today**.
2. Optionally **connect Google Calendar** from the sidebar (or the mobile overflow menu) so Google events show on Today and Calendar.
3. Create **projects** for ongoing work, then add **tasks** on Backlog or a project page.
4. Turn tasks into **time blocks** on Today or Calendar (or from a task’s Plan action on the backlog table).
5. At the end of the day, run **Start shutdown**: review each unreviewed block, then write a shutdown note.

### Tasks vs time blocks

- A **task** is work you still need to do. It can belong to a project, sit on a board column, have notes, a checklist, an estimate, a due date, and a priority.
- A **time block** is a stretch of calendar time with an **intent** (the title), a start and end, and optionally one or more tasks. Blocks can be dragged and resized on the day/week views. After the block, you **review** it (done / partial / missed, time actually spent, focus, notes, next step, blocked).

Planner-owned blocks can sync with Google once Calendar is connected. Events that only exist in Google show as **From Google** and are not edited as Planner blocks.

---

## Pages

Unauthenticated visits to any signed-in route redirect to sign-in, then back to the page you asked for.

### `/` — Home

Redirects to `/today`. There is no separate home screen.

### `/sign-in` — Sign in

Clerk sign-in. After a successful session (Clerk plus Convex), you go to Today, or to the `redirect` path if one was set.

Sub-paths such as `/sign-in/sso-callback` are part of Clerk’s sign-in flow.

### `/sign-up` — Sign up

Clerk sign-up. Same redirect behavior as sign-in.

### `/today` — Today

The daily cockpit.

- **Today’s intention** — a short note for the day. It saves when you leave the field.
- **Stats** — blocks planned, how many are reviewed, how many still need review, and total planned time (desktop).
- **Today’s schedule** — a vertical day rail of Planner blocks plus Google events. Click an empty slot or **+ Add time block** to create a block. Click a Planner block to edit it. Drag to move, resize from the bottom edge. You can also drop or attach tasks onto a block.
- **Review** — when a block needs a review, you can open it from the rail.
- **Start shutdown** — walks through every block that still needs a review, then asks for a **shutdown note** (“what happened / what you’ll pick up”). After that, Today shows when you shut down and the note.

### `/backlog` — Backlog

All tasks that are not archived (or archived, if you switch the filter).

- Filter by **Active / Archived** and by **project** (all, no project, or a specific project).
- **Board** (default) — Kanban columns you can rename, reorder, add, and delete. Drag tasks between columns. Add a task to a specific column from the column. Board layout is stored for your account (gear **Board settings**).
- **Table** — same tasks in a table. Change column, open details, delete, or **Plan** (opens a time-block dialog for that task). URL: `/backlog?view=table` or `view=board`.
- **+ Add task** — title, notes, checklist, column, project, estimate, due date, priority.

Deleting a non-empty column asks whether to move those tasks to Backlog or delete them.

### `/projects` — Projects

Cards for **active** projects: name, color, health, goal date, and progress from that project’s tasks vs Done. **+ New project** (or the dashed card) creates one with name, description, color, optional health (on track / at risk / off track), and optional goal date.

Click a card for the project page.

### `/projects/$projectId` — Project

One project’s board (same columns as Backlog, filtered to this project).

- Progress (leftover vs done) and health / goal caption when set.
- **Edit**, **Archive** (leaves the active list), or **Delete** (optionally delete its tasks).
- **+ Add task** is locked to this project.

### `/calendar` — Calendar

Week view of Planner blocks and Google events. Previous / next week, or jump around with the week controls.

- **+ New block** or click an empty slot to add a block on that day and time.
- Drag and resize Planner blocks; click to edit or review.
- On a narrow screen, pick a day of the week from the day tabs.

Legend: **Work**, **Personal**, and **From Google**.

---

## Account and Google Calendar

The sidebar footer (and mobile header) has:

- **Google connection** status and **Connect Google Calendar** / disconnect. Connecting grants calendar scope via your Google account in Clerk, then Planner can show Google events and sync Planner blocks.
- **User button** — Clerk account menu (profile, sign out).

---

## Run locally

You need Node 22+, Clerk keys, and a Convex deployment URL.

1. Copy `.env.example` to `.env.local` and fill in `VITE_CONVEX_URL`, Clerk publishable keys, and `CLERK_SECRET_KEY`.
2. Install dependencies (`bun install` or `npm install`).
3. `npm run dev` starts Convex and the Vite app together.

Useful scripts: `npm test`, `npm run lint`, `npm run build`.
