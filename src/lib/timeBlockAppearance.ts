export type ReviewOutcome = 'done' | 'partial' | 'missed'

export type BlockToneInput = {
  origin: 'app' | 'google'
  hasTasks: boolean
}

export type BlockReviewInput = {
  origin: 'app' | 'google'
  end: number
  memberships: Array<{ review?: { outcome: ReviewOutcome } }>
}

export function blockToneClass(block: BlockToneInput): string {
  if (block.origin === 'google') return 'bg-event-google'
  if (block.hasTasks) return 'bg-event-work'
  return 'bg-event-personal'
}

/** Sitting-level outcome only when every membership is reviewed and all match. */
export function sharedReviewOutcome(
  memberships: Array<{ review?: { outcome: ReviewOutcome } }>,
): ReviewOutcome | undefined {
  if (memberships.length === 0) return undefined
  if (memberships.some((m) => m.review === undefined)) return undefined
  const first = memberships[0].review!.outcome
  return memberships.every((m) => m.review!.outcome === first) ? first : undefined
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

/** Max visible characters for chip titles before appending "...". */
export const CHIP_TITLE_MAX_CHARS = 15

export function truncateChipTitle(
  title: string,
  maxChars = CHIP_TITLE_MAX_CHARS,
): string {
  if (title.length <= maxChars) return title
  return `${title.slice(0, maxChars)}...`
}

export function blockNeedsReview(block: BlockReviewInput, now: number): boolean {
  return (
    block.origin === 'app' &&
    block.end <= now &&
    block.memberships.length > 0 &&
    block.memberships.some((m) => m.review === undefined)
  )
}

/** Chip controls that must not start a drag. Review only — delete lives in the edit modal. */
export const BLOCK_CONTROL_SELECTOR = '[data-review-button="true"]'
export const TIME_BLOCK_CHIP_SELECTOR = '[data-time-block-chip="true"]'

/** SVG icon nodes are Elements (not HTMLElements) and still support closest(). */
function hasClosest(
  target: EventTarget | null,
): target is EventTarget & { closest: (selector: string) => unknown } {
  return target != null && typeof (target as { closest?: unknown }).closest === 'function'
}

export function isBlockControl(target: EventTarget | null): boolean {
  return hasClosest(target) && Boolean(target.closest(BLOCK_CONTROL_SELECTOR))
}

export function isTimeBlockChipTarget(target: EventTarget | null): boolean {
  return hasClosest(target) && Boolean(target.closest(TIME_BLOCK_CHIP_SELECTOR))
}
