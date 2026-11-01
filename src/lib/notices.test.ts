import { describe, expect, it, vi } from 'vitest'
import {
  MAX_NOTICES,
  NOTICE_MESSAGES,
  addNotice,
  blockUpdateFailedMessage,
  notifyOnFailure,
  removeNotice,
} from './notices'

describe('addNotice', () => {
  it('appends a notice', () => {
    expect(addNotice([], { id: 1, message: 'A' })).toEqual([
      { id: 1, message: 'A' },
    ])
  })

  it('does not stack the same message twice', () => {
    const notices = [{ id: 1, message: 'A' }]
    expect(addNotice(notices, { id: 2, message: 'A' })).toEqual(notices)
  })

  it(`keeps only the latest ${MAX_NOTICES}`, () => {
    let notices = addNotice([], { id: 1, message: 'A' })
    notices = addNotice(notices, { id: 2, message: 'B' })
    notices = addNotice(notices, { id: 3, message: 'C' })
    notices = addNotice(notices, { id: 4, message: 'D' })
    expect(notices.map((notice) => notice.id)).toEqual([2, 3, 4])
  })
})

it('removeNotice drops the notice with that id', () => {
  const notices = [
    { id: 1, message: 'A' },
    { id: 2, message: 'B' },
  ]
  expect(removeNotice(notices, 1)).toEqual([{ id: 2, message: 'B' }])
})

describe('notifyOnFailure', () => {
  it('stays quiet when the task succeeds', async () => {
    const notify = vi.fn()
    await notifyOnFailure(Promise.resolve('ok'), notify, 'Failed')
    expect(notify).not.toHaveBeenCalled()
  })

  it('shows the message instead of throwing when the task fails', async () => {
    const notify = vi.fn()
    await expect(
      notifyOnFailure(Promise.reject(new Error('boom')), notify, 'Failed'),
    ).resolves.toBeUndefined()
    expect(notify).toHaveBeenCalledWith('Failed')
  })

  it('accepts handlers that return nothing', async () => {
    const notify = vi.fn()
    await notifyOnFailure(undefined, notify, 'Failed')
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('blockUpdateFailedMessage', () => {
  it('says move when the start changes', () => {
    expect(blockUpdateFailedMessage(1000, { start: 2000, end: 3000 })).toBe(
      NOTICE_MESSAGES.blockMove,
    )
  })

  it('says resize when only the end changes', () => {
    expect(blockUpdateFailedMessage(1000, { start: 1000, end: 3000 })).toBe(
      NOTICE_MESSAGES.blockResize,
    )
    expect(blockUpdateFailedMessage(1000, { end: 3000 })).toBe(
      NOTICE_MESSAGES.blockResize,
    )
  })

  it("says move when the block isn't loaded", () => {
    expect(
      blockUpdateFailedMessage(undefined, { start: 2000, end: 3000 }),
    ).toBe(NOTICE_MESSAGES.blockMove)
  })
})
