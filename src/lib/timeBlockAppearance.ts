export type ReviewOutcome = 'done' | 'partial' | 'missed'

export type BlockToneInput = {
  origin: 'app' | 'google'
  taskId?: string
}

export type BlockReviewInput = BlockToneInput & {
  end: number
  review?: { outcome: ReviewOutcome }
}

export function blockToneClass(block: BlockToneInput): string {
  if (block.origin === 'google') return 'bg-event-google'
  if (block.taskId) return 'bg-event-work'
  return 'bg-event-personal'
}

export function reviewBorderClass(outcome: ReviewOutcome | undefined): string {
  if (outcome === 'done') return 'border-l-[3px] border-l-success'
  if (outcome === 'partial') return 'border-l-[3px] border-l-warning'
  if (outcome === 'missed') return 'border-l-[3px] border-l-destructive'
  return 'border-l-[3px] border-l-transparent'
}

export function reviewOutcomeLabel(outcome: ReviewOutcome): string {
  if (outcome === 'done') return 'Done'
  if (outcome === 'partial') return 'Partial'
  return 'Missed'
}

export function blockNeedsReview(block: BlockReviewInput, now: number): boolean {
  return (
    block.origin === 'app' &&
    block.taskId != null &&
    block.end <= now &&
    block.review === undefined
  )
}

export function isBlockControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest('[data-review-button="true"], [data-delete-button="true"]'),
    )
  )
}
