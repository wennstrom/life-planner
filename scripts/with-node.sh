#!/usr/bin/env bash
# Ensure package scripts run under the Node version pinned in .nvmrc.
# Needed because lazy nvm (shell functions for node/npm) does not affect
# `#!/usr/bin/env node` shebangs spawned by bun/npm.
set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

desired="$(tr -d '[:space:]' < .nvmrc)"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
export TMPDIR="${TMPDIR:-/tmp}"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "error: nvm not found at NVM_DIR=$NVM_DIR" >&2
  echo "Install nvm, or put Node ${desired} on PATH before running this script." >&2
  exit 1
fi

# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

# Prefer an already-installed match; only download if nothing matches .nvmrc.
if ! nvm use --silent >/dev/null 2>&1; then
  echo "Node ${desired} not installed; installing via nvm..." >&2
  nvm install --no-progress
  nvm use --silent
fi

node_major="$(node -p "process.versions.node.split('.')[0]")"
desired_major="${desired#v}"
desired_major="${desired_major%%.*}"
if [[ "$node_major" != "$desired_major" ]]; then
  echo "error: expected Node ${desired}, got $(node -v) ($(command -v node))" >&2
  exit 1
fi

exec "$@"
