import { describe, expect, it } from 'vitest'
import { createGoogleCalendarAttemptStore } from './googleCalendarAttempts'

function fakeStorage() {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
  }
}

describe('connect attempts', () => {
  it('remembers a connect attempt across the OAuth round-trip', () => {
    const store = createGoogleCalendarAttemptStore(fakeStorage())
    expect(store.hasConnectAttempt()).toBe(false)
    store.markConnectAttempt()
    expect(store.hasConnectAttempt()).toBe(true)
    store.clearConnectAttempt()
    expect(store.hasConnectAttempt()).toBe(false)
  })

  it('expires a stale attempt so a later reload cannot reconnect silently', () => {
    let clock = 1_000_000
    const store = createGoogleCalendarAttemptStore(fakeStorage(), () => clock)
    store.markConnectAttempt()
    clock += 9 * 60 * 1000
    expect(store.hasConnectAttempt()).toBe(true)
    clock += 2 * 60 * 1000
    expect(store.hasConnectAttempt()).toBe(false)
  })

  it('discards a corrupted attempt marker', () => {
    const storage = fakeStorage()
    const store = createGoogleCalendarAttemptStore(storage)
    storage.setItem('googleCalendar.connectAttempt', 'not-a-number')
    expect(store.hasConnectAttempt()).toBe(false)
    expect(storage.entries.size).toBe(0)
  })

  it('reports no attempt when storage is unavailable', () => {
    const store = createGoogleCalendarAttemptStore(null)
    store.markConnectAttempt()
    expect(store.hasConnectAttempt()).toBe(false)
  })
})

describe('repair attempts', () => {
  it('tracks repair attempts per user', () => {
    const store = createGoogleCalendarAttemptStore(fakeStorage())
    store.markRepairAttempt('user_a')
    expect(store.hasRepairAttempt('user_a')).toBe(true)
    expect(store.hasRepairAttempt('user_b')).toBe(false)
    store.clearRepairAttempt('user_a')
    expect(store.hasRepairAttempt('user_a')).toBe(false)
  })

  it('keeps a repair attempt until the scope is granted, so retries stay manual', () => {
    let clock = 0
    const store = createGoogleCalendarAttemptStore(fakeStorage(), () => clock)
    store.markRepairAttempt('user_a')
    clock += 60 * 60 * 1000
    expect(store.hasRepairAttempt('user_a')).toBe(true)
  })
})
