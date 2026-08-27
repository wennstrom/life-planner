import { Link, useRouterState } from '@tanstack/react-router'
import { UserButton } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { memo } from 'react'
import {
  CalendarClock,
  CalendarDays,
  FolderKanban,
  ListTodo,
  StickyNote,
  Sun,
} from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ConnectGoogleCalendar } from '~/components/auth/ConnectGoogleCalendar'
import { Badge } from '~/components/ui/badge'

const navItems: Array<{
  to: string
  label: string
  icon: LucideIcon
  countKey?: 'backlog'
}> = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/backlog', label: 'Backlog', icon: ListTodo, countKey: 'backlog' },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/notes', label: 'Notes', icon: StickyNote },
]

function SidebarInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const viewer = useQuery(api.users.viewer)
  const backlog = useQuery(api.backlog.get)

  return (
    <aside className="flex w-62 shrink-0 flex-col border-r border-border bg-card px-3.5 py-5">
      <div className="flex items-center gap-2.5 px-2.5 pb-4 pt-1.5 text-lg font-bold">
        <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-primary-foreground">
          <CalendarClock className="size-4" />
        </span>
        <span>Planner</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(`${item.to}/`)
          const count = item.countKey === 'backlog' ? backlog?.total : undefined
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{item.label}</span>
              {count !== undefined && count > 0 ? (
                <Badge
                  className={cn(
                    'rounded-full border-0 px-2 py-0.5 text-xs font-semibold',
                    active
                      ? 'bg-card text-primary'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {count}
                </Badge>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 pt-3.5">
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              'size-2 rounded-full',
              viewer?.googleConnected ? 'bg-success' : 'bg-slate-400',
            )}
          />
          {viewer?.googleConnected
            ? 'Google connected'
            : 'Google not connected'}
        </div>
        <ConnectGoogleCalendar
          googleConnected={viewer?.googleConnected ?? false}
        />
        <div className="mt-1 flex items-center gap-2.5 border-t border-border px-3 py-2.5">
          <UserButton
            appearance={{
              elements: {
                rootBox: 'flex w-full',
                userButtonTrigger: 'rounded-md',
              },
            }}
          />
        </div>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-10 py-8">{children}</main>
    </div>
  )
}
