import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

export function DefaultError({ reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-sm text-foreground">Couldn’t load this page.</p>
      <p className="text-xs text-muted-foreground">
        Please try again. If this keeps happening, sign out and sign in.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
