import { CalendarDays, Check, FolderKanban, ListTodo, Sun } from 'lucide-react'
import type { CSSProperties } from 'react'
import { BrandMark } from '~/components/landing/BrandMark'
import { cn } from '~/lib/utils'

/* Static, non-interactive copy of the Today page with sample data. */

const HOUR_PX = 50

const railHours = ['08', '09', '10', '11', '12', '13']

const railBlocks: Array<{
  title: string
  meta: string
  top: number
  height: number
  kind: 'work' | 'personal' | 'google'
  state?: 'done' | 'review'
}> = [
  { title: 'Inbox zero', meta: '08:00', top: 6, height: 42, kind: 'work', state: 'done' },
  { title: 'Deep work: pricing page', meta: 'Review', top: 56, height: 92, kind: 'work', state: 'review' },
  { title: 'Design sync', meta: 'From Google', top: 156, height: 40, kind: 'google' },
  { title: 'Lunch run, 5k', meta: '12:00', top: 206, height: 44, kind: 'personal' },
  { title: 'Write launch email', meta: '13:00', top: 256, height: 40, kind: 'work' },
]

const stats = [
  { value: '5', label: 'Blocks planned' },
  { value: '2', label: 'Reviewed' },
  { value: '1', label: 'Needs review' },
  { value: '6h 30m', label: 'Planned time' },
]

const focusTasks = [
  { title: 'Pick pricing tiers', done: true },
  { title: 'Draft FAQ copy', done: true },
  { title: 'Build comparison table', done: false },
  { title: 'Book physio', done: false },
]

const weekDays = [
  { day: 'Mon', date: 20 },
  { day: 'Tue', date: 21 },
  { day: 'Wed', date: 22 },
  { day: 'Thu', date: 23, selected: true },
  { day: 'Fri', date: 24 },
]

export function PreviewBlock({
  title,
  meta,
  kind,
  state,
  style,
  className,
}: {
  title: string
  meta: string
  kind: 'work' | 'personal' | 'google'
  state?: 'done' | 'review'
  style?: CSSProperties
  className?: string
}) {
  return (
    <div
      style={style}
      className={cn(
        'flex justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-white',
        kind === 'work' && 'bg-event-work',
        kind === 'personal' && 'bg-event-personal',
        kind === 'google' &&
          'border border-l-4 border-event-google bg-white text-event-google',
        state === 'done' && 'opacity-55',
        state === 'review' &&
          'shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--warning)]',
        className,
      )}
    >
      <span className="truncate">{title}</span>
      {state === 'review' ? (
        <span className="h-[18px] self-center rounded-full bg-white/20 px-2 text-[11px]">
          {meta}
        </span>
      ) : (
        <small className="shrink-0 font-medium opacity-85">{meta}</small>
      )}
    </div>
  )
}

export function PreviewCheck({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-[#c7c7cc]',
        done && 'border-success bg-success text-white',
      )}
    >
      {done && <Check className="size-2.5" strokeWidth={3} />}
    </span>
  )
}

function RailNavItem({
  icon: Icon,
  label,
  active,
}: {
  icon: typeof Sun
  label: string
  active?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] font-medium text-muted-foreground',
        active && 'bg-background font-semibold text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </div>
  )
}

export function TodayPreview() {
  return (
    <div className="mx-auto mt-14 max-w-[1040px] rounded-[20px] border bg-muted p-2.5">
      <div
        aria-hidden
        className="grid min-h-[520px] overflow-hidden rounded-[14px] border bg-background text-left lg:grid-cols-[200px_1fr]"
      >
        <aside className="hidden flex-col gap-0.5 bg-muted px-3 py-[18px] lg:flex">
          <div className="flex items-center gap-2.5 px-2 pb-4 text-[15px] font-bold">
            <BrandMark className="size-6 rounded-[7px]" />
            Planner
          </div>
          <RailNavItem icon={Sun} label="Today" active />
          <RailNavItem icon={ListTodo} label="Backlog" />
          <RailNavItem icon={FolderKanban} label="Projects" />
          <RailNavItem icon={CalendarDays} label="Calendar" />
          <div className="mt-4 px-2.5 pb-1.5 text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
            Projects
          </div>
          {[
            { name: 'Website relaunch', color: 'var(--event-work)' },
            { name: 'Marathon prep', color: 'var(--event-personal)' },
            { name: 'Summer trip', color: '#f9ab00' },
          ].map((project) => (
            <div
              key={project.name}
              className="flex items-center gap-2.5 px-2.5 py-2 text-[13.5px] font-medium text-muted-foreground"
            >
              <span
                className="size-2 rounded-[3px]"
                style={{ background: project.color }}
              />
              {project.name}
            </div>
          ))}
        </aside>

        <div className="flex flex-col gap-4 px-[26px] py-[22px]">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.02em]">Today</h2>
              <div className="text-[13px] text-muted-foreground">
                Thursday, October 23
              </div>
            </div>
            <div className="hidden gap-1.5 sm:flex">
              {weekDays.map((d) => (
                <div
                  key={d.date}
                  className={cn(
                    'w-[38px] rounded-[10px] py-1.5 text-center text-[11px] text-muted-foreground',
                    d.selected && 'bg-foreground text-[#c7c7cc]',
                  )}
                >
                  {d.day}
                  <b
                    className={cn(
                      'block text-sm text-foreground',
                      d.selected && 'text-white',
                    )}
                  >
                    {d.date}
                  </b>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-sm sm:flex-row sm:items-center sm:gap-3">
            <span className="text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
              Intention
            </span>
            Ship the pricing page, then leave the laptop at 17:00.
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl bg-muted px-3.5 py-2.5">
                <div className="text-xl font-bold tracking-[-0.02em]">
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="grid flex-1 gap-[18px] lg:grid-cols-[1fr_240px]">
            <div className="relative h-[300px] overflow-hidden rounded-xl border">
              {railHours.map((hour, i) => (
                <div
                  key={hour}
                  className={cn(
                    'absolute inset-x-0 h-[50px] border-t',
                    i === 0 && 'border-t-0',
                  )}
                  style={{ top: i * HOUR_PX }}
                >
                  <span className="absolute top-1 left-2.5 text-[11px] text-muted-foreground">
                    {hour}
                  </span>
                </div>
              ))}
              {railBlocks.map((block) => (
                <PreviewBlock
                  key={block.title}
                  {...block}
                  className="absolute right-2.5 left-[50px]"
                  style={{ top: block.top, height: block.height }}
                />
              ))}
              <div
                className="absolute right-0 left-11 h-0.5 bg-[#ea4335] before:absolute before:-top-[3px] before:-left-1 before:size-2 before:rounded-full before:bg-[#ea4335]"
                style={{ top: 201 }}
              />
            </div>

            <div className="flex flex-col gap-2 rounded-xl border px-3.5 py-3">
              <h4 className="mb-0.5 text-[13px] font-semibold">Focus</h4>
              {focusTasks.map((task) => (
                <div key={task.title} className="flex items-center gap-2.5 text-[13px]">
                  <PreviewCheck done={task.done} />
                  <span
                    className={cn(
                      task.done && 'text-muted-foreground line-through',
                    )}
                  >
                    {task.title}
                  </span>
                </div>
              ))}
              <div className="mt-auto rounded-[10px] bg-foreground p-2.5 text-center text-[13px] font-semibold text-white">
                Start shutdown
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
