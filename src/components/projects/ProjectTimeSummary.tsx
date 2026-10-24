import type { ReactNode } from 'react'
import type { ProjectTimeStats } from '~/lib/project-stats'
import { dateFromDateKey, formatDateKey } from '~/lib/dates'
import { formatMinutes } from '~/lib/format'
import { isGoalOverdue } from '~/lib/project-health'
import {
  formatFocus,
  hasAnyBlocks,
  workingDaysUntil,
} from '~/lib/project-stats'

type ProjectTimeSummaryProps = {
  stats: ProjectTimeStats
  project: { goalDate?: string }
  nowMs: number
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function shortDate(dateKey: string) {
  return dateFromDateKey(dateKey).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function StatCell({
  label,
  value,
  children,
}: {
  label: string
  value: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="min-w-[200px] flex-1 bg-card px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 truncate text-[17px] font-medium tracking-[-0.3px] tabular-nums">
        {value}
      </div>
      {children ? (
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground tabular-nums">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** The stat strip under the project header. Plain facts, no verdicts. */
export function ProjectTimeSummary({
  stats,
  project,
  nowMs,
}: ProjectTimeSummaryProps) {
  const today = formatDateKey(new Date(nowMs))
  const showTime = hasAnyBlocks(stats)
  const focusWeek = formatFocus(stats.focusWeek)
  const focusAllTime = formatFocus(stats.focusAllTime, { includeOther: true })

  const { remaining } = stats
  const showGoal = project.goalDate !== undefined && remaining.openCount > 0
  const goalPassed =
    project.goalDate !== undefined && isGoalOverdue(project.goalDate, today)
  const estimatedCount = remaining.openCount - remaining.unestimatedCount

  if (!showTime && !showGoal) return null

  return (
    <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[14px] border border-border bg-border">
      {showTime ? (
        <>
          <StatCell
            label="This week"
            value={
              <>
                {formatMinutes(stats.spentWeekMinutes)}
                <span className="ml-1.5 text-xs font-normal tracking-normal text-muted-foreground">
                  of {formatMinutes(stats.plannedWeekMinutes)} planned
                </span>
              </>
            }
          >
            {focusWeek ? <p>{focusWeek}</p> : null}
          </StatCell>
          <StatCell
            label="All-time"
            value={formatMinutes(stats.spentAllTimeMinutes)}
          >
            {focusAllTime ? <p>{focusAllTime}</p> : null}
          </StatCell>
        </>
      ) : null}

      {showGoal && project.goalDate ? (
        <StatCell
          label="To goal"
          value={
            estimatedCount > 0
              ? `≈ ${formatMinutes(remaining.estimatedMinutes)} left`
              : plural(remaining.unestimatedCount, 'open task')
          }
        >
          {estimatedCount > 0 && remaining.unestimatedCount > 0 ? (
            <p>+{plural(remaining.unestimatedCount, 'task')} without estimates</p>
          ) : estimatedCount === 0 ? (
            <p>No estimates yet</p>
          ) : null}
          <p>
            {goalPassed
              ? `Goal was ${shortDate(project.goalDate)}`
              : `${plural(workingDaysUntil(today, project.goalDate), 'working day')} to ${shortDate(project.goalDate)}`}
          </p>
        </StatCell>
      ) : null}

    </div>
  )
}
