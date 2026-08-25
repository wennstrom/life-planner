import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'

import { Input } from '~/components/ui/input'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover'
import { canonicalTime, closestTimeOption } from '~/lib/timeInput'
import { cn } from '~/lib/utils'

export type TimeOption = { value: string; label: string }

type TimeComboboxProps = {
  id: string
  value: string
  onCommit: (next: string) => void
  options: Array<TimeOption>
}

export function TimeCombobox({
  id,
  value,
  onCommit,
  options,
}: TimeComboboxProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const openedByTyping = useRef(false)
  const lastMatchesRef = useRef(options)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [hasTyped, setHasTyped] = useState(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (!hasTyped) lastMatchesRef.current = options
  }, [hasTyped, options])

  const closest = closestTimeOption(value, options)

  useLayoutEffect(() => {
    if (!open || hasTyped || closest == null) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const selected = listRef.current?.querySelector(
          `[data-time="${CSS.escape(closest)}"]`,
        )
        selected?.scrollIntoView({ block: 'center' })
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [open, hasTyped, closest])

  const query = draft.trim().toLowerCase()
  const matching =
    hasTyped && query
      ? options.filter(
          (option) =>
            option.value.toLowerCase().includes(query) ||
            option.label.toLowerCase().includes(query),
        )
      : options
  if (matching.length > 0) lastMatchesRef.current = matching

  // Only "Invalid time" when nothing matches the list and the draft is not a real clock time.
  // Partials like "12" still match 12:00 / 12:15 and must keep those rows visible.
  const draftLooksInvalid =
    hasTyped &&
    query.length > 0 &&
    matching.length === 0 &&
    canonicalTime(draft) == null
  const filtered = matching.length > 0 ? matching : lastMatchesRef.current

  const commitDraft = () => {
    const next = canonicalTime(draft)
    if (next) {
      if (next !== value) onCommit(next)
      setDraft(next)
    } else {
      setDraft(value)
    }
    setHasTyped(false)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      if (openedByTyping.current) {
        openedByTyping.current = false
      } else {
        setHasTyped(false)
      }
    } else {
      openedByTyping.current = false
      setHasTyped(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(value)
      setHasTyped(false)
      setOpen(false)
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            id={id}
            autoComplete="off"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setHasTyped(true)
              if (!open) openedByTyping.current = true
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={commitDraft}
            onKeyDown={handleKeyDown}
            className="pr-8"
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Show times"
              className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground"
              onMouseDown={(event) => {
                event.preventDefault()
              }}
            >
              <ChevronDownIcon className="size-4 opacity-50" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={listRef}
        className="max-h-64 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {draftLooksInvalid ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Invalid time</p>
        ) : (
          filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              data-time={option.value}
              className={cn(
                'flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                !hasTyped && option.value === closest && 'bg-accent',
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                if (option.value !== value) onCommit(option.value)
                setDraft(option.value)
                setHasTyped(false)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}
