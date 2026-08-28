import { ClipboardCheck } from 'lucide-react'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip'
import { msToTimeLabel } from '~/lib/dates'
import { cn } from '~/lib/utils'
import { SUBTITLE_MIN_HEIGHT } from '../../lib/calendarGeometry'
import {
  blockToneClass,
  reviewBorderClass,
  reviewOutcomeLabel,
  sharedReviewOutcome,
  truncateChipTitle,
} from '../../lib/timeBlockAppearance'
import { useBlockPointerDrag } from './useBlockPointerDrag'

type TimeBlockChipProps = {
  block: TimeBlockView
  needsReview: boolean
  top: number
  height: number
  dayStartMs: number
  /** Character-clamp long titles (week columns). Day rail keeps the full title. */
  truncateTitle?: boolean
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: TimeBlockView) => void
  onEditBlock: (block: TimeBlockView) => void
}

export function TimeBlockChip({
  block,
  needsReview: showReview,
  top,
  height,
  dayStartMs,
  truncateTitle = false,
  onUpdateBlock,
  onReviewBlock,
  onEditBlock,
}: TimeBlockChipProps) {
  const drag = useBlockPointerDrag({
    top,
    height,
    dayStartMs,
    durationMs: block.end - block.start,
    onCommit: (patch) => onUpdateBlock(block._id, patch),
    onActivate: () => onEditBlock(block),
  })

  const reviewOutcome = sharedReviewOutcome(block.memberships)
  const showReviewButton = Boolean(showReview && onReviewBlock)
  const hasRoomForExtra =
    drag.displayedHeight >= SUBTITLE_MIN_HEIGHT
  const timeLabel = `${msToTimeLabel(block.start)} – ${msToTimeLabel(block.end)}`
  const showTimeBody = hasRoomForExtra
  const showOutcomeLabel = Boolean(reviewOutcome) && hasRoomForExtra
  const displayTitle = truncateTitle
    ? truncateChipTitle(block.title)
    : block.title
  const titleWraps = !truncateTitle && hasRoomForExtra

  return (
    <div
      data-time-block-chip="true"
      className={cn(
        'group/chip absolute inset-x-0 flex touch-none select-none flex-col overflow-hidden rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-white',
        blockToneClass({
          origin: block.origin,
          hasTasks: block.memberships.length > 0,
        }),
        reviewBorderClass(reviewOutcome),
      )}
      style={{
        top: drag.displayedTop,
        height: drag.displayedHeight,
        cursor: drag.resizing
          ? 'ns-resize'
          : drag.dragging
            ? 'grabbing'
            : 'pointer',
      }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex shrink-0 items-start gap-1.5">
          <div
            className={cn(
              'min-w-0 flex-1 leading-snug',
              titleWraps ? 'wrap-break-word whitespace-normal' : 'truncate',
            )}
            title={displayTitle === block.title ? undefined : block.title}
          >
            {displayTitle}
          </div>
          {showReviewButton ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-review-button="true"
                  aria-label="Review"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/30 hover:bg-white/50"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onReviewBlock?.(block)
                  }}
                >
                  <ClipboardCheck className="pointer-events-none size-3" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Review</TooltipContent>
            </Tooltip>
          ) : null}
          {block.origin === 'google' ? (
            <span className="shrink-0 rounded border border-white/50 px-1 py-0.5 text-[10px] opacity-85">
              Google
            </span>
          ) : null}
          {showOutcomeLabel && reviewOutcome ? (
            <span className="shrink-0 text-[10px] font-semibold text-white/90">
              {reviewOutcomeLabel(reviewOutcome)}
            </span>
          ) : null}
        </div>
        {showTimeBody ? (
          <div className="min-h-0 truncate text-[10px] font-normal text-white/80">
            {timeLabel}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        data-resize-handle="true"
        aria-label="Change end time"
        className="absolute inset-x-0 bottom-0 z-10 flex h-3 cursor-ns-resize items-center justify-center"
      >
        <span
          aria-hidden
          className="h-0.5 w-8 rounded-full bg-white/60 opacity-0 transition-opacity group-hover/chip:opacity-100 group-active/chip:opacity-100"
        />
      </button>
    </div>
  )
}
