# Backlog

**Objective:** plan your work and track your projects.

Cal Newport's ideas shape how we get there: time-block planning, deep work, multi-scale planning, and Slow Productivity's "do fewer things". The app stays flexible. His methods are the defaults, never the rules.

## Principles

Every task below should follow these, the same way the existing design does (shutdown is "not a lock", the review queue can be skipped, review fields are optional, board columns can be renamed):

- **Serve the objective.** A feature belongs here only if it helps you plan work or see how a project is going.
- **Newport's way is the default, not the rule.** New features start with his defaults, but you can change them or switch them off.
- **Suggest, never block.** Limits and budgets show warnings or information. They never stop a save, a drag, or a new block.
- **Every step can be skipped.** Planning rituals can be skipped or left half done, and the app doesn't nag or count it against you.
- **Calm by default.** No streaks, scores, or push notifications. Just plain facts about where your time went.

## Foundation

- [ ] **User settings.** Add a `userSettings` table (one row per user) and a Settings page. Features below that can be configured or switched off store their settings here. Missing values fall back to defaults, so nothing changes for existing users until they opt in.

## 1. Project tracking: connect projects to time

Today a project's progress is just done tasks against all tasks (`projectProgress`), plus a health and goal date you set by hand. Time blocks and reviews already record where your time goes, but projects never see that data.

- [ ] **Time per project.** Add up planned block minutes and reviewed `actualMinutes` for each project, through `timeBlockTasks`, then task, then `projectId`.
  - [ ] Show "planned this week / spent this week / spent all-time" on the project page and on project cards.
  - [ ] Show deep versus shallow minutes per project, from the review's `focus` field.
- [ ] **Last worked on, and stalled projects.** Show "Last block: 3 days ago" on each active project. Flag projects with no blocks for N days as a quiet hint (N set in settings, default 14). Don't change health automatically.
- [ ] **Next action per project.** Show the next unfinished task by board order on the project card and page. If a review left a `nextStep` for one of the project's tasks, show the latest one. Answers "what do I do next on this?" at a glance.
- [ ] **Remaining work against the goal date.** When tasks have estimates and the project has a goal date, show "≈ 12h of work left · 9 working days to goal". If some tasks have no estimate, show the count of unestimated tasks instead of guessing. Information only; health stays manual.
- [ ] **Project log.** A timeline on the project page of reviewed blocks for its tasks: date, outcome, time, note, next step, blocked reason. `TaskHistory.tsx` already does this per task, so reuse it for the whole project.
- [ ] **Health with a reason.** Add an optional short note when you set health ("At risk: waiting on API access"), shown next to the health pill. Optionally ask about it during the weekly review, with no reminders.

## 2. Planning: the week, tied to projects

Newport plans at three levels: season, week, day. The app only has the day.

- [ ] **Weekly plan.** Add a `weekRecords` table (like `dayRecords`) with a free-text plan note, shown on Calendar. The week start day comes from settings (default Monday).
  - [ ] **Focus projects for the week.** Pick which projects matter this week. Calendar and Today show them first.
  - [ ] **Planned time per focus project.** As you place blocks, the weekly plan shows "Project A: 6h planned" with an optional target per project. Information only.
  - [ ] **Weekly review panel** (facts only, nothing to fill in): time per project planned vs spent, missed blocks, that week's shutdown notes, stalled projects, health changes.
- [ ] **Fix "Moving forward" on Today.** It currently shows the first two projects by sort order (`.slice(0, 2)` in `today.tsx`). Show the week's focus projects instead, falling back to projects with blocks this week.
- [ ] **Plan from the project.** On the project page, a Plan action on each task (like the backlog table already has) and a "Block time for this project" button that opens the time-block dialog with the project's next action filled in.
- [ ] **Unplanned deadlines.** On Calendar and the weekly plan, list tasks due this week (or overdue) that have no block yet, each with a one-click Plan action.
- [ ] **Season plan.** One optional note per planning period. Period length comes from settings (quarter by default). It names the projects that matter, links to their goal dates, and the weekly plan shows it read-only.

## 3. Daily execution

- [ ] **Optional block kind.** Add an optional `kind` to `timeBlocks` from a user-defined list, managed like board columns. Seed it with Deep / Shallow / Admin. When a block's kind is set, use it for the rail colour and to pre-fill `focus` in its review. This feeds the deep-versus-shallow numbers in project tracking.
- [ ] **Plan revision, recorded quietly.** The first time a block is moved or resized, save its original start and end. Planned vs actual drift only shows up in the block review and the weekly review. (Listed as not yet decided in `docs/wayfinder/today-redesign/MAP.md`.)
- [ ] **Shutdown steps you can configure.** The current flow (review queue, then close note) stays the default. Optional steps you can skip, switched on in settings:
  - [ ] Capture open loops: a quick-add box that creates backlog tasks, with an optional project.
  - [ ] Look at tomorrow: a read-only list of tomorrow's blocks and Google events.
  - [ ] Draft tomorrow's first block, with the next action from a focus project suggested.
- [ ] **Optional working hours.** Set a workday end time in settings, per weekday, unset by default. When set, draw a subtle cut-off line on the day rail. Blocks after it are still allowed.


## Design rule

- [ ] Write the principles above down as a design rule in `CLAUDE.md` / `AGENTS.md` so future work follows them.
