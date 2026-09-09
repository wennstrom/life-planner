#!/usr/bin/env bash
# Netlify's local CLI inherits the shell Node (often 20). Cloud builds set
# NODE_VERSION=22 and do not have this repo's nvm. Prefer nvm locally.
set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${VITE_CONVEX_URL:-}" && -f "$ROOT/.env.local" ]]; then
  VITE_CONVEX_URL="$(grep -E '^VITE_CONVEX_URL=' "$ROOT/.env.local" | tail -1 | cut -d= -f2-)"
  export VITE_CONVEX_URL
fi
if [[ -z "${VITE_CONVEX_URL:-}" ]]; then
  echo "Missing VITE_CONVEX_URL. Vite bakes this at build time; it must be the Convex deployment that has CLERK_JWT_ISSUER_DOMAIN." >&2
  exit 1
fi
echo "Building against Convex: ${VITE_CONVEX_URL}"

if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  exec "$ROOT/scripts/with-node.sh" ./node_modules/.bin/vite build
fi

exec ./node_modules/.bin/vite build
