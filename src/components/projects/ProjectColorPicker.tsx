import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { BOARD_COLUMN_COLORS } from '../../../convex/lib/boardColumnColors'
import type { Id } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'

export function ProjectColorPicker({
  projectId,
  color,
}: {
  projectId: Id<'projects'>
  color: string
}) {
  const updateProject = useMutation(api.projects.update)
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {BOARD_COLUMN_COLORS.map((swatch) => {
        const selected = color === swatch
        return (
          <button
            key={swatch}
            type="button"
            aria-label={swatch}
            aria-pressed={selected}
            className={cn(
              'size-7 rounded-full border border-border/60',
              selected &&
                'ring-2 ring-ring ring-offset-2 ring-offset-background',
            )}
            style={{ background: swatch }}
            onClick={() => void updateProject({ projectId, color: swatch })}
          />
        )
      })}
    </div>
  )
}
