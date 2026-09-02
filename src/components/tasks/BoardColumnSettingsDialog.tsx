import { useEffect, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'
import {
  SETTINGS_PALETTE,
  canAddColumn,
  insertWorkflowRow,
  moveRow,
  nextNewColumnName,
  rowsFromColumns,
  toSavePayload,
  type SettingsRow,
} from '~/lib/board-column-settings'

type ColumnDoc = {
  _id: Id<'boardColumns'>
  name: string
  color: string
  isDone: boolean
  order: number
}

export function BoardColumnSettingsDialog({
  open,
  onClose,
  columns,
  taskCounts,
}: {
  open: boolean
  onClose: () => void
  columns: Array<ColumnDoc>
  taskCounts: Record<string, number>
}) {
  const save = useMutation(api.boardColumns.save)
  const remove = useMutation(api.boardColumns.remove)
  const [rows, setRows] = useState<Array<SettingsRow>>([])
  const [pendingRemove, setPendingRemove] = useState<SettingsRow | null>(null)

  useEffect(() => {
    if (open) setRows(rowsFromColumns(columns))
  }, [open, columns])

  const pendingCount = pendingRemove?.id
    ? (taskCounts[pendingRemove.id] ?? 0)
    : 0

  const uniqueKey = useMemo(() => {
    let n = 0
    return () => {
      n += 1
      return `new-${n}-${Date.now()}`
    }
  }, [open])

  async function handleSave() {
    await save(
      toSavePayload(rows) as {
        columns: Array<{ id?: Id<'boardColumns'>; name: string; color: string }>
      },
    )
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Board columns</DialogTitle>
          </DialogHeader>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {rows.map((row, index) => (
              <li key={row.key} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  {row.isDone ? (
                    <span className="flex-1 text-sm font-medium">Done</span>
                  ) : (
                    <Input
                      value={row.name}
                      aria-label="Column name"
                      onChange={(event) => {
                        const name = event.target.value
                        setRows((current) =>
                          current.map((item) =>
                            item.key === row.key ? { ...item, name } : item,
                          ),
                        )
                      }}
                    />
                  )}
                  {!row.isDone ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        onClick={() => setRows((current) => moveRow(current, index, -1))}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        onClick={() => setRows((current) => moveRow(current, index, 1))}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Delete column"
                        onClick={() => {
                          if (!row.id) {
                            setRows((current) => current.filter((item) => item.key !== row.key))
                            return
                          }
                          setPendingRemove(row)
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SETTINGS_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      className={cn(
                        'size-6 rounded-full border border-border',
                        row.color === color && 'ring-2 ring-ring ring-offset-2',
                      )}
                      style={{ background: color }}
                      onClick={() =>
                        setRows((current) =>
                          current.map((item) =>
                            item.key === row.key ? { ...item, color } : item,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={!canAddColumn(rows)}
              onClick={() =>
                setRows((current) =>
                  insertWorkflowRow(current, {
                    key: uniqueKey(),
                    name: nextNewColumnName(current),
                    color: SETTINGS_PALETTE[0]!,
                    isDone: false,
                  }),
                )
              }
            >
              Add column
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSave()}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingRemove && pendingCount === 0 ? (
        <ConfirmDialog
          open
          onClose={() => setPendingRemove(null)}
          title="Delete column?"
          confirmLabel="Delete"
          confirmVariant="destructive"
          onConfirm={async () => {
            if (!pendingRemove.id) return
            await remove({ columnId: pendingRemove.id as Id<'boardColumns'> })
            setPendingRemove(null)
          }}
        />
      ) : null}

      <Dialog
        open={pendingRemove != null && pendingCount > 0}
        onOpenChange={(next) => (!next ? setPendingRemove(null) : undefined)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete column?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This column has {pendingCount} {pendingCount === 1 ? 'task' : 'tasks'}.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!pendingRemove?.id) return
                await remove({
                  columnId: pendingRemove.id as Id<'boardColumns'>,
                  disposition: 'move-to-backlog',
                })
                setPendingRemove(null)
              }}
            >
              Move {pendingCount} tasks to Backlog
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!pendingRemove?.id) return
                await remove({
                  columnId: pendingRemove.id as Id<'boardColumns'>,
                  disposition: 'delete-tasks',
                })
                setPendingRemove(null)
              }}
            >
              Delete {pendingCount} tasks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
