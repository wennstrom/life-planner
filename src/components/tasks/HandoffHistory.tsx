import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'

export function HandoffHistory({
  taskId,
  onOpenTask,
}: {
  taskId: Id<'tasks'>
  onOpenTask: (id: Id<'tasks'>) => void
}) {
  const history = useQuery(api.taskHandoffs.listForTask, { taskId })
  return (
    <section aria-label="Agent handoffs" className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Agent handoffs</h3>
      {history === undefined ? (
        <p className="text-sm text-muted-foreground">Loading handoffs…</p>
      ) : history.handoffs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agent handoffs yet.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {history.handoffs.map((handoff) => (
            <li
              key={handoff._id}
              className="space-y-3 border-b border-border pb-4 last:border-0"
            >
              <div className="text-xs text-muted-foreground">
                <p className="break-words">
                  {handoff.agent} ·{' '}
                  <time dateTime={new Date(handoff.at).toISOString()}>
                    {new Date(handoff.at).toLocaleString()}
                  </time>
                </p>
                <p className="break-all">{handoff.sessionId}</p>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">
                {handoff.summary}
              </p>
              <div className="space-y-1 text-sm">
                <h4 className="font-medium">
                  Tests ·{' '}
                  {handoff.tester === 'agent' ? 'Agent tested' : 'User to test'}
                </h4>
                {handoff.testList.length ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {handoff.testList.map((item, i) => (
                      <li key={i} className="whitespace-pre-wrap break-words">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No tests listed.</p>
                )}
              </div>
              {handoff.nextSteps.length ? (
                <div className="space-y-1 text-sm">
                  <h4 className="font-medium">Next steps</h4>
                  <ul className="list-disc space-y-1 pl-5">
                    {handoff.nextSteps.map((item, i) => (
                      <li key={i} className="whitespace-pre-wrap break-words">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {handoff.followUps.length ? (
                <div className="space-y-1 text-sm">
                  <h4 className="font-medium">Follow-up tasks</h4>
                  <ul>
                    {handoff.followUps.map((task) => (
                      <li key={task.id}>
                        {task.available ? (
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto max-w-full justify-start whitespace-normal px-0 text-left"
                            onClick={() => onOpenTask(task.id)}
                          >
                            {task.title}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">
                            Deleted task
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {history?.truncated ? (
        <p className="text-xs text-muted-foreground">
          Showing the latest 50 handoffs.
        </p>
      ) : null}
    </section>
  )
}
