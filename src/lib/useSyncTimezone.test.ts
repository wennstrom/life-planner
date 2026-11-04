import { describe, expect, it } from 'vitest'
import { timezoneToSync } from './useSyncTimezone'

describe('timezoneToSync', () => {
  it('waits for the stored value to load', () => {
    expect(timezoneToSync(undefined, 'Europe/Stockholm')).toBeNull()
  })

  it('saves the browser zone when none is stored', () => {
    expect(timezoneToSync(null, 'Europe/Stockholm')).toBe('Europe/Stockholm')
  })

  it('saves the browser zone when it changed', () => {
    expect(timezoneToSync('Europe/Stockholm', 'America/New_York')).toBe(
      'America/New_York',
    )
  })

  it('does nothing when the zones match or the browser has none', () => {
    expect(timezoneToSync('Europe/Stockholm', 'Europe/Stockholm')).toBeNull()
    expect(timezoneToSync(null, undefined)).toBeNull()
    expect(timezoneToSync(null, '')).toBeNull()
  })
})
