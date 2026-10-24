import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { ChevronDown } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { PROJECT_LOG_DEFAULT_LIMIT } from '../../../convex/lib/projectStats'
import type { Id } from '../../../convex/_generated/dataModel'
import { BlockHistoryList } from '~/components/tasks/BlockHistoryList'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

type ProjectLogProps = {
  projectId: Id<'projects'>
  nowMs: number
}

export function ProjectLog({ projectId, nowMs }: ProjectLogProps) {
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(PROJECT_LOG_DEFAULT_LIMIT)
  const { data } = useQuery({
    ...convexQuery(api.projects.log, { projectId, nowMs, limit }),
    enabled: open,
    placeholderData: keepPreviousData,
  })

  return (
    <section className="mt-8">
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          className={cn('size-4 transition-transform', !open && '-rotate-90')}
          aria-hidden
        />
        Log
      </button>
      {open ? (
        <div className="mt-3">
          {data === undefined ? (
            <p className="text-sm text-muted-foreground">Loading log…</p>
          ) : (
            <>
              <BlockHistoryList
                blocks={data.blocks}
                isMine={(m) => m.projectId === projectId}
                showTaskTitles
                emptyText="No blocks yet."
              />
              {data.hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    setLimit((value) => value + PROJECT_LOG_DEFAULT_LIMIT)
                  }
                >
                  Show more
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
