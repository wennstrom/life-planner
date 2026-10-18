import { cn } from '~/lib/utils'
import { formatDateKey, weekStripDays } from '~/lib/dates'

export function WeekStrip({
  today,
  selectedDateKey,
  onSelect,
}: {
  today: Date
  selectedDateKey: string
  onSelect: (dateKey: string) => void
}) {
  const todayKey = formatDateKey(today)

  return (
    <div
      className="grid grid-cols-7 gap-1 border-b border-border p-3"
      role="tablist"
      aria-label="Days this week"
    >
      {weekStripDays(today).map((day) => {
        const selected = day.dateKey === selectedDateKey
        const isToday = day.dateKey === todayKey
        return (
          <button
            key={day.dateKey}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-pressed={selected}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-[7px] py-1.5 text-xs',
              selected ? 'bg-primary text-white' : 'text-muted-foreground',
              !selected && isToday && 'font-semibold text-foreground',
            )}
            onClick={() => onSelect(day.dateKey)}
          >
            <span>{day.label}</span>
            <span className="text-sm font-medium">{day.dayNum}</span>
          </button>
        )
      })}
    </div>
  )
}
