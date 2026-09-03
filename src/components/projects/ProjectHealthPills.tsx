import { cn } from '~/lib/utils'
import {
  PROJECT_HEALTH,
  PROJECT_HEALTH_DOT_CLASS,
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_PILL_CLASS,
  type ProjectHealth,
} from '~/lib/project-health'

type ProjectHealthPillsProps = {
  value: ProjectHealth
  onChange: (health: ProjectHealth) => void
  disabled?: boolean
}

export function ProjectHealthPills({
  value,
  onChange,
  disabled,
}: ProjectHealthPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROJECT_HEALTH.map((health) => {
        const selected = value === health
        return (
          <button
            key={health}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              PROJECT_HEALTH_PILL_CLASS[health],
              selected
                ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                : 'opacity-70',
            )}
            onClick={() => onChange(health)}
          >
            <span
              className={cn('size-1.5 rounded-full', PROJECT_HEALTH_DOT_CLASS[health])}
            />
            {PROJECT_HEALTH_LABEL[health]}
          </button>
        )
      })}
    </div>
  )
}
