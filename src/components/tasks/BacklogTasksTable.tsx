import {
  flexRender,
  useTable,
  tableFeatures,
  rowSortingFeature,
  rowPaginationFeature,
  createSortedRowModel,
  createPaginatedRowModel,
  sortFns,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Trash2,
} from 'lucide-react'
import { useMemo } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { TaskStats } from '../../../convex/lib/taskStats'
import { formatTaskRollup } from '~/lib/format'
import { cn } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
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

export type BacklogTaskActions = {
  toggle: (taskId: BacklogTask['_id'], done: boolean) => void
  plan: (taskId: BacklogTask['_id']) => void
  openDetails: (task: BacklogTask) => void
  remove: (task: BacklogTask) => void
}

const PAGE_SIZES = [10, 20, 50] as const

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
}

type ColMeta = { thClass?: string; tdClass?: string }

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
  columnMeta: {} as ColMeta,
})

type F = typeof features

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ChevronUp className="size-3.5" />
  if (sorted === 'desc') return <ChevronDown className="size-3.5" />
  return (
    <span className="inline-flex flex-col opacity-40">
      <ChevronUp className="-mb-1 size-3" />
      <ChevronDown className="size-3" />
    </span>
  )
}

function SortableHeader({
  label,
  onSort,
  sorted,
}: {
  label: string
  onSort: ((event: unknown) => void) | undefined
  sorted: false | 'asc' | 'desc'
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={onSort}
    >
      {label} <SortIcon sorted={sorted} />
    </button>
  )
}

export function BacklogTasksTable({
  tasks,
  actions,
}: {
  tasks: Array<BacklogTask>
  actions: BacklogTaskActions
}) {
  const columns = useMemo<Array<ColumnDef<F, BacklogTask>>>(
    () => [
      {
        id: 'project',
        accessorFn: (r) => r.project?.name ?? '',
        meta: { thClass: 'w-0 pr-1', tdClass: 'w-0 pr-2 whitespace-nowrap' },
        header: ({ column }) => (
          <SortableHeader
            label="Project"
            onSort={column.getToggleSortingHandler()}
            sorted={column.getIsSorted()}
          />
        ),
        cell: ({ row }) => {
          const p = row.original.project
          return p ? (
            <Badge
              className="rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                color: p.color,
                backgroundColor: `color-mix(in srgb, ${p.color} 14%, transparent)`,
              }}
            >
              {p.name}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">No project</span>
          )
        },
      },
      {
        accessorKey: 'title',
        meta: { thClass: 'pl-1', tdClass: 'pl-2 whitespace-normal' },
        header: ({ column }) => (
          <SortableHeader
            label="Task"
            onSort={column.getToggleSortingHandler()}
            sorted={column.getIsSorted()}
          />
        ),
        cell: ({ row }) => {
          const t = row.original
          const done = t.status === 'done'
          return (
            <div className="min-w-[12rem] whitespace-normal">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm', done && 'text-muted-foreground line-through')}>
                  {t.title}
                </span>
                {t.active ? (
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    Active
                  </Badge>
                ) : null}
              </div>
              {t.stats.blockCount > 0 ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatTaskRollup(t.stats, t.estimateMinutes)}
                </p>
              ) : null}
            </div>
          )
        },
      },
      {
        id: 'priority',
        accessorFn: (r) => r.priority ?? 0,
        header: ({ column }) => (
          <SortableHeader
            label="Priority"
            onSort={column.getToggleSortingHandler()}
            sorted={column.getIsSorted()}
          />
        ),
        cell: ({ row }) => {
          const p = row.original.priority
          return (
            <span className="text-sm text-muted-foreground">
              {p != null ? (PRIORITY_LABELS[p] ?? p) : ''}
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
                actions.plan(row.original._id)
              }}
            >
              <CalendarPlus className="mr-1 size-3.5" /> Plan
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="text-primary text-white"
              onClick={(e) => {
                e.stopPropagation()
                actions.remove(row.original)
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [actions],
  )

  const table = useTable(
    {
      features,
      data: tasks,
      columns,
      initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZES[0] } },
    },
    (s) => ({ sorting: s.sorting, pagination: s.pagination }),
  )

  if (tasks.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No tasks in the backlog.
      </p>
    )
  }

  const { pageIndex, pageSize } = table.state.pagination
  const pageCount = table.getPageCount()

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={h.column.columnDef.meta?.thClass}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                role="button"
                tabIndex={0}
                onClick={() => actions.openDetails(row.original)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    actions.openDetails(row.original)
                  }
                }}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={cell.column.columnDef.meta?.tdClass}>
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
          Showing {pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, tasks.length)}{' '}
          of {tasks.length}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-[4.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
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
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
