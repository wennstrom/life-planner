import { Clock3 } from 'lucide-react'
import { cn } from '~/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-white [&_svg]:size-[55%]',
        className,
      )}
    >
      <Clock3 strokeWidth={2.5} />
    </span>
  )
}
