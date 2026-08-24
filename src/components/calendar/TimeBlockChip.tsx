import { Trash2 } from 'lucide-react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { SUBTITLE_MIN_HEIGHT } from '../../lib/calendarGeometry'
import {
  blockToneClass,
  reviewBorderClass,
  reviewOutcomeLabel,
} from '../../lib/timeBlockAppearance'
import { useBlockPointerDrag } from './useBlockPointerDrag'

type TimeBlockChipProps = {
  block: Doc<'timeBlocks'>
  taskTitle?: string
  needsReview: boolean
  top: number
  height: number
  dayStartMs: number
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
  onRemoveBlock: (block: Doc<'timeBlocks'>) => void
}

export function TimeBlockChip({
  block,
  taskTitle,
  needsReview: showReview,
  top,
  height,
  dayStartMs,
  onUpdateBlock,
  onReviewBlock,
  onRemoveBlock,
}: TimeBlockChipProps) {
  const drag = useBlockPointerDrag({
    top,
    height,
    dayStartMs,
    durationMs: block.end - block.start,
    onCommit: (patch) => onUpdateBlock(block._id, patch),
  })

  const reviewOutcome = block.review?.outcome
  const showTaskSubtitle = Boolean(taskTitle) && drag.displayedHeight >= SUBTITLE_MIN_HEIGHT
  const showOutcomeLabel =
    Boolean(reviewOutcome) && drag.displayedHeight >= SUBTITLE_MIN_HEIGHT

  return (
    <div
      className={cn(
        'group absolute inset-x-2 touch-none select-none overflow-hidden rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-white',
        blockToneClass(block),
        reviewBorderClass(reviewOutcome),
      )}
      style={{
        top: drag.displayedTop,
        height: drag.displayedHeight,
        cursor: drag.resizing
          ? 'ns-resize'
          : drag.dragging
            ? 'grabbing'
            : 'grab',
      }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate">{block.title}</div>
          {showTaskSubtitle ? (
            <div className="truncate text-[10px] font-normal text-white/80">
              {taskTitle}
            </div>
          ) : null}
        </div>
        {showOutcomeLabel && reviewOutcome ? (
          <span className="shrink-0 text-[10px] font-semibold text-white/90">
            {reviewOutcomeLabel(reviewOutcome)}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {block.origin === 'google' ? (
          <span className="rounded border border-white/50 px-1 py-0.5 text-[10px] opacity-85">
            Google
          </span>
        ) : null}
        {showReview && onReviewBlock ? (
          <button
            type="button"
            data-review-button="true"
            className="rounded bg-white/30 px-1 py-0.5 text-[10px] font-semibold hover:bg-white/50"
            onClick={(event) => {
              event.stopPropagation()
              onReviewBlock(block)
            }}
          >
            Review
          </button>
        ) : null}
        <button
          type="button"
          data-delete-button="true"
          aria-label="Delete time block"
          className="ml-auto rounded bg-black/25 p-0.5 opacity-0 transition-opacity hover:bg-black/40 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onRemoveBlock(block)
          }}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <button
        type="button"
        data-resize-handle="true"
        aria-label="Resize time block"
        className="absolute right-1.5 bottom-1 size-2.5 cursor-ns-resize opacity-50"
      />
    </div>
  )
}
