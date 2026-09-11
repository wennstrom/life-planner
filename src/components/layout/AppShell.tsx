import { Link, useRouterState } from '@tanstack/react-router'
import { UserButton } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { memo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  FolderKanban,
  ListTodo,
  Sun,
} from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ConnectGoogleCalendar } from '~/components/auth/ConnectGoogleCalendar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  SIDEBAR_COLLAPSED_KEY,
  parseSidebarCollapsed,
  sidebarCollapsedStorageValue,
} from '~/lib/sidebarCollapsed'

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
]

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return parseSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY))
}

function navLabelForPath(pathname: string): string {
  const match = navItems.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
  return match?.label ?? 'Planner'
}

function SidebarInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const viewer = useQuery(api.users.viewer)
  const backlog = useQuery(api.backlog.get, {})
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      localStorage.setItem(
        SIDEBAR_COLLAPSED_KEY,
        sidebarCollapsedStorageValue(next),
      )
      return next
    })
  }

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-card py-5 transition-[width] md:flex',
        collapsed ? 'w-16 px-2' : 'w-62 px-3.5',
      )}
    >
      <div
        className={cn(
          'flex items-center pb-4 pt-1.5',
          collapsed ? 'flex-col gap-2' : 'gap-2.5 px-2.5 text-lg font-bold',
        )}
      >
        <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-primary-foreground">
          <CalendarClock className="size-4" />
        </span>
        {collapsed ? null : <span className="flex-1">Planner</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
        >
          {collapsed ? (
            <ArrowRight className="size-4" />
          ) : (
            <ArrowLeft className="size-4" />
          )}
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(`${item.to}/`)
          const count = item.countKey === 'backlog' ? backlog?.total : undefined
          const Icon = item.icon
          const ariaLabel = collapsed
            ? count !== undefined && count > 0
              ? `${item.label} (${count})`
              : item.label
            : undefined
          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              aria-label={ariaLabel}
              className={cn(
                'flex items-center rounded-md py-2.5 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                active
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {collapsed ? null : (
                <>
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
                </>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 pt-3.5">
        {collapsed ? null : (
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
        )}
        <ConnectGoogleCalendar
          googleConnected={viewer?.googleConnected ?? false}
          collapsed={collapsed}
        />
        <div
          className={cn(
            'mt-1 flex items-center border-t border-border py-2.5',
            collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
          )}
        >
          <UserButton
            appearance={{
              elements: {
                rootBox: collapsed ? 'flex' : 'flex w-full',
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

function MobileTopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const viewer = useQuery(api.users.viewer)

  return (
    <header className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
      <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-primary-foreground">
        <CalendarClock className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-base font-semibold">
        {navLabelForPath(pathname)}
      </span>
      <ConnectGoogleCalendar
        googleConnected={viewer?.googleConnected ?? false}
        menu
      />
      <UserButton
        appearance={{
          elements: {
            rootBox: 'flex',
            userButtonTrigger: 'rounded-md',
          },
        }}
      />
    </header>
  )
}

function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const backlog = useQuery(api.backlog.get, {})

  return (
    <nav
      className="z-40 shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      <div className="grid grid-cols-4">
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
                'relative flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
              {count !== undefined && count > 0 ? (
                <Badge className="absolute top-1 right-3 h-4 min-w-4 rounded-full border-0 px-1 text-[10px] font-semibold leading-4">
                  {count > 99 ? '99+' : count}
                </Badge>
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-10 md:py-8">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  )
}
