import { describe, expect, it } from 'vitest'
import {
  canonicalTime,
  endAfterDuration,
  endTimeOptions,
  formatDurationLabel,
  formatTime,
  isEndAfterStart,
  parseTimeInput,
  shiftEndPreservingDuration,
  startTimeOptions,
} from './timeInput'

describe('parseTimeInput', () => {
  it('accepts H:MM and HH:MM', () => {
    expect(parseTimeInput('9:07')).toEqual({ hours: 9, minutes: 7 })
    expect(parseTimeInput('09:07')).toEqual({ hours: 9, minutes: 7 })
    expect(parseTimeInput('0:00')).toEqual({ hours: 0, minutes: 0 })
    expect(parseTimeInput(' 09:07 ')).toEqual({ hours: 9, minutes: 7 })
  })

  it('accepts 3 or 4 digits with no separator', () => {
    expect(parseTimeInput('907')).toEqual({ hours: 9, minutes: 7 })
    expect(parseTimeInput('0930')).toEqual({ hours: 9, minutes: 30 })
    expect(parseTimeInput('000')).toEqual({ hours: 0, minutes: 0 })
  })

  it('rejects invalid clock times', () => {
    expect(parseTimeInput('')).toBeNull()
    expect(parseTimeInput('abc')).toBeNull()
    expect(parseTimeInput('9:7')).toBeNull()
    expect(parseTimeInput('9:99')).toBeNull()
    expect(parseTimeInput('24:00')).toBeNull()
    expect(parseTimeInput('25:00')).toBeNull()
    expect(parseTimeInput('9am')).toBeNull()
    expect(parseTimeInput('09:07 PM')).toBeNull()
  })
})

describe('formatTime', () => {
  it('zero-pads HH:MM', () => {
    expect(formatTime(9, 7)).toBe('09:07')
    expect(formatTime(0, 0)).toBe('00:00')
    expect(formatTime(23, 59)).toBe('23:59')
  })
})

describe('canonicalTime', () => {
  it('normalizes valid input', () => {
    expect(canonicalTime('9:07')).toBe('09:07')
    expect(canonicalTime('0930')).toBe('09:30')
    expect(canonicalTime('nope')).toBeNull()
  })
})

describe('formatDurationLabel', () => {
  it('formats minutes, hours, and mixed', () => {
    expect(formatDurationLabel(15 * 60_000)).toBe('15 min')
    expect(formatDurationLabel(45 * 60_000)).toBe('45 min')
    expect(formatDurationLabel(60 * 60_000)).toBe('1 hr')
    expect(formatDurationLabel(120 * 60_000)).toBe('2 hr')
    expect(formatDurationLabel(75 * 60_000)).toBe('1 hr 15 min')
    expect(formatDurationLabel(125 * 60_000)).toBe('2 hr 5 min')
  })
})

describe('startTimeOptions', () => {
  it('is 00:00 through 23:45 in 15-minute steps', () => {
    const options = startTimeOptions()
    expect(options).toHaveLength(96)
    expect(options[0]).toEqual({ value: '00:00', label: '00:00' })
    expect(options[1]).toEqual({ value: '00:15', label: '00:15' })
    expect(options.at(-1)).toEqual({ value: '23:45', label: '23:45' })
    expect(options.some((o) => o.value === '23:59')).toBe(false)
  })
})

describe('endTimeOptions', () => {
  it('starts after an off-grid start and includes 23:59 with duration labels', () => {
    const options = endTimeOptions('09:07')
    expect(options[0]?.value).toBe('09:15')
    expect(options[0]?.label).toBe('09:15 (8 min)')
    expect(options.find((o) => o.value === '10:07')).toBeUndefined()
    expect(options.find((o) => o.value === '10:00')?.label).toBe(
      '10:00 (53 min)',
    )
    expect(options.at(-1)?.value).toBe('23:59')
    expect(options.at(-1)?.label).toBe('23:59 (14 hr 52 min)')
  })

  it('lists 15-minute slots after an on-grid start', () => {
    const options = endTimeOptions('09:00')
    expect(options[0]).toEqual({
      value: '09:15',
      label: '09:15 (15 min)',
    })
    expect(options.find((o) => o.value === '10:00')?.label).toBe('10:00 (1 hr)')
  })
})

describe('shiftEndPreservingDuration', () => {
  it('moves End by the same duration', () => {
    expect(
      shiftEndPreservingDuration({
        previousStart: '09:00',
        previousEnd: '10:00',
        nextStart: '11:00',
      }),
    ).toBe('12:00')
  })

  it('keeps off-grid minutes', () => {
    expect(
      shiftEndPreservingDuration({
        previousStart: '09:07',
        previousEnd: '10:07',
        nextStart: '10:07',
      }),
    ).toBe('11:07')
  })

  it('clamps to 23:59', () => {
    expect(
      shiftEndPreservingDuration({
        previousStart: '09:00',
        previousEnd: '10:00',
        nextStart: '23:00',
      }),
    ).toBe('23:59')
  })
})

describe('endAfterDuration', () => {
  it('adds minutes and clamps to 23:59', () => {
    expect(endAfterDuration('09:00', 60)).toBe('10:00')
    expect(endAfterDuration('23:00', 60)).toBe('23:59')
  })
})

describe('isEndAfterStart', () => {
  it('requires a strictly later End', () => {
    expect(isEndAfterStart('09:00', '10:00')).toBe(true)
    expect(isEndAfterStart('09:00', '09:00')).toBe(false)
    expect(isEndAfterStart('23:59', '23:59')).toBe(false)
    expect(isEndAfterStart('09:07', '09:05')).toBe(false)
  })
})
