import { cn } from '~/lib/utils'
import { formatDateKey, weekStripDays } from '~/lib/dates'

export function WeekStrip({ today }: { today: Date }) {
  const todayKey = formatDateKey(today)

  return (
    <div className="grid grid-cols-7 gap-1 border-b border-border p-3">
      {weekStripDays(today).map((day) => {
        const isToday = day.dateKey === todayKey
        return (
          <button
            key={day.dateKey}
            type="button"
            aria-pressed={isToday}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-[7px] py-1.5 text-xs',
              isToday ? 'bg-primary text-white' : 'text-muted-foreground',
            )}
          >
            <span>{day.label}</span>
            <span className="text-sm font-medium">{day.dayNum}</span>
          </button>
        )
      })}
    </div>
  )
}
