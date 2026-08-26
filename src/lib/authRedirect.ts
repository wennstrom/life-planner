const DEFAULT_PATH = '/today'

export function getSafeRedirectPath(redirect: string | undefined): string {
  if (
    !redirect ||
    !redirect.startsWith('/') ||
    redirect.startsWith('//') ||
    redirect.includes('\\')
  ) {
    return DEFAULT_PATH
  }

  return redirect
}

export function buildSignInSearch(
  pathname: string,
  authMismatch = false,
): { redirect?: string; authMismatch?: 1 } {
  const search: { redirect?: string; authMismatch?: 1 } = {}

  if (pathname && pathname !== DEFAULT_PATH) {
    search.redirect = pathname
  }
  if (authMismatch) {
    search.authMismatch = 1
  }

  return search
}
