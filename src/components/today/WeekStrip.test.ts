import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WeekStrip } from './WeekStrip'

function pressedDays(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .filter((match) => /aria-pressed="true"/.test(match[1] ?? ''))
    .map((match) => {
      const numbers = [...(match[2] ?? '').matchAll(/>(\d+)</g)].map((n) => n[1])
      return numbers.at(-1)
    })
}

describe('WeekStrip', () => {
  it('marks the selected day, not only today', () => {
    const html = renderToStaticMarkup(
      createElement(WeekStrip, {
        today: new Date(2026, 9, 18),
        selectedDateKey: '2026-10-16',
        onSelect: () => {},
      }),
    )

    expect(pressedDays(html)).toEqual(['16'])
  })
})
