import { cn } from '~/lib/utils'

export function NowMarker({
  top,
  label,
  withGutterLabel = false,
}: {
  top: number
  label: string
  withGutterLabel?: boolean
}) {
  return (
    <div
      role="img"
      aria-label={`Current time ${label}`}
      className="pointer-events-none absolute right-0 left-0 z-20"
      style={{ top }}
    >
      <div className="flex -translate-y-1/2 items-center">
        {withGutterLabel ? (
          <span className="w-[52px] shrink-0 pr-1.5 text-right text-[11px] font-semibold tabular-nums text-secondary-foreground">
            {label}
          </span>
        ) : (
          <span className="size-2 shrink-0 -translate-x-1/2 rounded-full bg-secondary-foreground" />
        )}
        <div
          className={cn(
            'h-px flex-1 bg-secondary-foreground',
            withGutterLabel && 'relative',
          )}
        >
          {withGutterLabel ? (
            <span className="absolute top-1/2 left-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary-foreground" />
          ) : null}
        </div>
      </div>
    </div>
  )
}
