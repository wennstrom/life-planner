import type { Doc } from '../../../convex/_generated/dataModel'

type TaskRowProps = {
  task: Doc<'tasks'> & { project?: Doc<'projects'> | null }
  onToggle?: () => void
  onSendToToday?: () => void
  onRemoveFromToday?: () => void
  onOpenDetails?: () => void
  showProjectTag?: boolean
}

export function TaskRow({
  task,
  onToggle,
  onSendToToday,
  onRemoveFromToday,
  onOpenDetails,
  showProjectTag = true,
}: TaskRowProps) {
  const done = task.status === 'done'

  return (
    <li className={`task${done ? ' done' : ''}`}>
      <button
        type="button"
        className={`check${done ? ' checked' : ''}`}
        onClick={onToggle}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
      >
        {done ? '✓' : ''}
      </button>
      {onOpenDetails ? (
        <button type="button" className="task-title" onClick={onOpenDetails}>
          {task.title}
        </button>
      ) : (
        <span className="task-title">{task.title}</span>
      )}
      {showProjectTag && task.project ? (
        <span className="tag" style={{ ['--tag' as string]: task.project.color }}>
          {task.project.name}
        </span>
      ) : null}
      {onSendToToday ? (
        <button type="button" className="mini-btn" onClick={onSendToToday}>
          → Today
        </button>
      ) : null}
      {onRemoveFromToday ? (
        <button type="button" className="mini-btn" onClick={onRemoveFromToday}>
          Remove
        </button>
      ) : null}
    </li>
  )
}
