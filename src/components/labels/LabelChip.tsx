import { cn } from '~/lib/utils'

export type LabelChipData = { _id: string; name: string; color: string }

/** A small label pill with a colour dot. */
export function LabelChip({
  label,
  className,
}: {
  label: Pick<LabelChipData, 'name' | 'color'>
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[12rem] items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: label.color }}
      />
      <span className="truncate">{label.name}</span>
    </span>
  )
}
