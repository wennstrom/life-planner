import { cn } from '~/lib/utils'

/** Inline copy of `public/logo.svg`, so the mark renders without an extra request. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn('size-7 shrink-0', className)}
    >
      <rect width="64" height="64" rx="15" fill="#1d1d1f" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" strokeWidth="5" />
      <path d="M32 32V20.5A11.5 11.5 0 0 1 43.5 32Z" fill="#fff" />
    </svg>
  )
}
