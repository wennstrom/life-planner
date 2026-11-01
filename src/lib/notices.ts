export type Notice = { id: number; message: string }

export type Notify = (message: string) => void

/** Only the latest few notices stay on screen. */
export const MAX_NOTICES = 3

export const NOTICE_MESSAGES = {
  blockMove: "Couldn't move the block. Try again.",
  blockResize: "Couldn't resize the block. Try again.",
  blockCreate: "Couldn't add the block. Try again.",
  taskUpdate: "Couldn't update the task. Try again.",
  taskMove: "Couldn't move the task. Try again.",
  columnReorder: "Couldn't reorder the columns. Try again.",
  columnRename: "Couldn't rename the column. Try again.",
  columnAdd: "Couldn't add a column. Try again.",
} as const

/** Adds a notice, unless the same message is already showing. */
export function addNotice(
  notices: ReadonlyArray<Notice>,
  notice: Notice,
): Array<Notice> {
  if (notices.some((existing) => existing.message === notice.message)) {
    return [...notices]
  }
  return [...notices, notice].slice(-MAX_NOTICES)
}

export function removeNotice(
  notices: ReadonlyArray<Notice>,
  id: number,
): Array<Notice> {
  return notices.filter((notice) => notice.id !== id)
}

/** Waits for `task`; if it fails, shows `message` instead of throwing. */
export async function notifyOnFailure(
  task: unknown,
  notify: Notify,
  message: string,
): Promise<void> {
  try {
    await task
  } catch {
    notify(message)
  }
}

/** Drag and resize both send start and end; a resize keeps the start. */
export function blockUpdateFailedMessage(
  currentStart: number | undefined,
  patch: { start?: number; end?: number },
): string {
  return patch.start === undefined || patch.start === currentStart
    ? NOTICE_MESSAGES.blockResize
    : NOTICE_MESSAGES.blockMove
}
