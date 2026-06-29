import { Link, useRouterState } from '@tanstack/react-router'
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { ReactNode } from 'react'

const navItems = [
  { to: '/today', label: 'Today', icon: '☀' },
  { to: '/backlog', label: 'Backlog', icon: '☰', countKey: 'backlog' as const },
  { to: '/projects', label: 'Projects', icon: '▤' },
  { to: '/calendar', label: 'Calendar', icon: '▦' },
  { to: '/notes', label: 'Notes', icon: '✎' },
]

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const viewer = useQuery(api.users.viewer)
  const backlog = useQuery(api.backlog.get)
  const { signOut } = useAuthActions()
  const { isAuthenticated } = useConvexAuth()

  const initials =
    viewer?.user?.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '?'

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">◷</span>
        <span className="brand-name">Planner</span>
      </div>

      <nav className="nav">
        {navItems.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(`${item.to}/`)
          const count =
            item.countKey === 'backlog' ? backlog?.total : undefined
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-item${active ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {count !== undefined && count > 0 ? (
                <span className="nav-count">{count}</span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="google-status">
          <span
            className="dot"
            style={{
              background: viewer?.googleConnected ? 'var(--green)' : '#94a3b8',
            }}
          />
          {viewer?.googleConnected ? 'Google connected' : 'Google not connected'}
        </div>
        {isAuthenticated ? (
          <button
            type="button"
            className="nav-item subtle"
            onClick={() => void signOut()}
          >
            <span className="nav-icon">⎋</span> Sign out
          </button>
        ) : null}
        <div className="user">
          <div className="avatar">{initials}</div>
          <div className="user-meta">
            <div className="user-name">{viewer?.user?.name ?? 'Guest'}</div>
            <div className="user-email">{viewer?.user?.email ?? ''}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  )
}
