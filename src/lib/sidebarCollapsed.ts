export const SIDEBAR_COLLAPSED_KEY = 'life-planner.sidebar-collapsed'

export function parseSidebarCollapsed(raw: string | null): boolean {
  return raw === '1' || raw === 'true'
}

export function sidebarCollapsedStorageValue(collapsed: boolean): string {
  return collapsed ? '1' : '0'
}
