import { flexRender } from '@tanstack/react-table'
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from '@tanstack/react-table/legacy'
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { TaskStats } from '../../../convex/lib/taskStats'
import { formatTaskRollup } from '~/lib/format'
import { cn } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'

export type BacklogTask = Doc<'tasks'> & {
  project: Doc<'projects'> | null
  stats: TaskStats
  active: boolean
}

type BacklogTasksTableProps = {
  tasks: Array<BacklogTask>
  onToggleDone: (taskId: BacklogTask['_id'], done: boolean) => void
  onPlan: (taskId: BacklogTask['_id']) => void
  onOpenDetails: (task: BacklogTask) => void
  onRemove: (task: BacklogTask) => void
}

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
}

function SortableHeader({
  label,
  sorted,
  onToggle,
}: {
  label: string
  sorted: false | 'asc' | 'desc'
  onToggle: ((event: unknown) => void) | undefined
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={onToggle}
    >
      {label}
      {sorted === 'asc' ? (
        <ChevronUp className="size-3.5" />
      ) : sorted === 'desc' ? (
        <ChevronDown className="size-3.5" />
      ) : (
        <span className="inline-flex flex-col opacity-40">
          <ChevronUp className="-mb-1 size-3" />
          <ChevronDown className="size-3" />
        </span>
      )}
    </button>
  )
}

function prioritySortValue(priority: number | undefined): number {
  if (priority == null) return 1
  if (priority === 1) return 2
  if (priority === 2) return 3
  if (priority === 3) return 4
  return 2
}

export function BacklogTasksTable({
  tasks,
  onToggleDone,
  onPlan,
  onOpenDetails,
  onRemove,
}: BacklogTasksTableProps) {
  const columns = useMemo<Array<LegacyColumnDef<BacklogTask>>>(
    () => [
      {
        id: 'done',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const done = row.original.status === 'done'
          return (
            <Checkbox
              checked={done}
              aria-label={done ? 'Mark not done' : 'Mark done'}
              onCheckedChange={(checked) =>
                onToggleDone(row.original._id, checked === true)
              }
              onClick={(e) => e.stopPropagation()}
            />
          )
        },
        size: 40,
      },
      {
        id: 'project',
        accessorFn: (row) => row.project?.name ?? '',
        header: ({ column }) => (
          <SortableHeader
            label="Project"
            sorted={column.getIsSorted()}
            onToggle={column.getToggleSortingHandler()}
          />
        ),
        cell: ({ row }) => {
          const project = row.original.project
          if (!project) {
            return (
              <span className="text-sm text-muted-foreground">No project</span>
            )
          }
          return (
            <Badge
              className="rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                color: project.color,
                backgroundColor: `color-mix(in srgb, ${project.color} 14%, transparent)`,
              }}
            >
              {project.name}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <SortableHeader
            label="Task"
            sorted={column.getIsSorted()}
            onToggle={column.getToggleSortingHandler()}
          />
        ),
        cell: ({ row }) => {
          const task = row.original
          const done = task.status === 'done'
          const showRollup = task.stats.blockCount > 0
          return (
            <div className="min-w-[12rem] whitespace-normal">
              <span
                className={cn(
                  'text-sm',
                  done && 'text-muted-foreground line-through',
                )}
              >
                {task.title}
              </span>
              {showRollup ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatTaskRollup(task.stats, task.estimateMinutes)}
                </p>
              ) : null}
            </div>
          )
        },
      },
      {
        id: 'priority',
        accessorFn: (row) => prioritySortValue(row.priority),
        header: ({ column }) => (
          <SortableHeader
            label="Priority"
            sorted={column.getIsSorted()}
            onToggle={column.getToggleSortingHandler()}
          />
        ),
        cell: ({ row }) => {
          const priority = row.original.priority
          if (priority == null) {
            return (
              <span className="text-sm text-muted-foreground"></span>
            )
          }
          return (
            <span className="text-sm">
              {PRIORITY_LABELS[priority] ?? priority}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onPlan(row.original._id)
              }}
            >
              <CalendarPlus className="mr-1 size-3.5" />
              Plan
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="text-primary text-white"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(row.original)
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [onToggleDone, onPlan, onRemove],
  )

  const table = useLegacyTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: PAGE_SIZE_OPTIONS[0],
      },
    },
  })

  if (tasks.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No tasks in the backlog.
      </p>
    )
  }

  const { pageIndex, pageSize } = table.getState().pagination
  const pageCount = table.getPageCount()
  const rowStart = pageIndex * pageSize + 1
  const rowEnd = Math.min((pageIndex + 1) * pageSize, tasks.length)

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.id === 'done' && 'w-10 px-2',
                      header.column.id === 'project' && 'w-0 pr-1',
                      header.column.id === 'title' && 'pl-1',
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => onOpenDetails(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      cell.column.id === 'done' && 'px-2',
                      cell.column.id === 'project' && 'w-0 pr-2 whitespace-nowrap',
                      cell.column.id === 'title' && 'pl-2 whitespace-normal',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {rowStart}–{rowEnd} of {tasks.length}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="h-8 w-[4.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
