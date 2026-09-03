<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `npx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Worktrees

When starting any new feature or fix, begin by creating a separate git worktree from the base
branch and do all work inside it, so parallel agents never overwrite each other's changes.
After the work is merged, clean up by removing the worktree. For the next task, create a fresh
worktree from the latest base branch — don't reuse old trees.

Point the worktree at the main checkout's secrets: replace the worktree `.env.local` with a
symlink to `<main-repo>/.env.local` (Clerk + Convex keys). Done when `ls -l .env.local` shows
that symlink. Restart `npm run dev` in the worktree after creating it so Vite loads the keys.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
