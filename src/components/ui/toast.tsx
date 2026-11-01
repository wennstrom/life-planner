import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Toast as ToastPrimitive } from 'radix-ui'

import type { Notice, Notify } from '~/lib/notices'
import { addNotice, removeNotice } from '~/lib/notices'

const NotifyContext = React.createContext<Notify | null>(null)

/** Short, plain notices for things that didn't work. No success toasts. */
function ToastProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = React.useState<Array<Notice>>([])
  const nextId = React.useRef(0)

  const notify = React.useCallback<Notify>((message) => {
    nextId.current += 1
    const notice = { id: nextId.current, message }
    setNotices((current) => addNotice(current, notice))
  }, [])

  return (
    <NotifyContext.Provider value={notify}>
      <ToastPrimitive.Provider duration={6000} label="Notice">
        {children}
        {notices.map((notice) => (
          <ToastPrimitive.Root
            key={notice.id}
            data-slot="toast"
            onOpenChange={(open) => {
              if (!open) {
                setNotices((current) => removeNotice(current, notice.id))
              }
            }}
            className="pointer-events-auto flex items-start gap-3 rounded-[10px] border border-border bg-white px-4 py-3 text-sm text-foreground shadow-[0_8px_30px_#2f2f2f1a] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)"
          >
            <ToastPrimitive.Description className="flex-1">
              {notice.message}
            </ToastPrimitive.Description>
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="-mr-1 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-hidden"
            >
              <XIcon className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="pointer-events-none fixed inset-x-4 bottom-[calc(82px+env(safe-area-inset-bottom))] z-[100] flex flex-col gap-2 outline-none md:inset-x-auto md:right-6 md:bottom-6 md:w-[360px]" />
      </ToastPrimitive.Provider>
    </NotifyContext.Provider>
  )
}

function useNotify(): Notify {
  const notify = React.useContext(NotifyContext)
  if (!notify) {
    throw new Error('useNotify must be used inside ToastProvider')
  }
  return notify
}

export { ToastProvider, useNotify }
