import { Skeleton } from '~/components/ui/skeleton'

export function PagePending() {
  return (
    <section aria-busy="true" aria-live="polite">
      <header className="mb-6">
        <Skeleton className="mb-2.5 h-7 w-36" />
        <Skeleton className="h-4 w-56" />
      </header>
      <div className="mt-2 flex flex-col gap-3">
        <Skeleton className="h-3.5 w-full max-w-[480px]" />
        <Skeleton className="h-3.5 w-full max-w-[480px]" />
        <Skeleton className="h-3.5 w-full max-w-[320px]" />
      </div>
    </section>
  )
}
