#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
supported() {
  version=$("$1" --version 2>/dev/null) || return 1
  major=${version%%.*}
  rest=${version#*.}
  minor=${rest%%.*}
  [ "$major" -gt 1 ] || { [ "$major" -eq 1 ] && [ "$minor" -ge 3 ]; }
}

runtime=${COMMENT_ON_COPY_BUN:-bun}
if ! supported "$runtime"; then
  if [ -z "${COMMENT_ON_COPY_BUN:-}" ] && supported "$HOME/.local/bin/bun"; then
    runtime=$HOME/.local/bin/bun
  else
    printf '%s\n' 'Comment on Copy requires Bun 1.3.0+. Install Bun or set COMMENT_ON_COPY_BUN to its executable.' >&2
    exit 1
  fi
fi

runtime=$(command -v "$runtime")
PATH=$(dirname -- "$runtime"):$PATH
export PATH

cd "$root"
action=${1:-}
if [ "$#" -gt 0 ]; then shift; fi
case $action in
  install) exec "$runtime" install --frozen-lockfile "$@" ;;
  check) exec "$runtime" run check "$@" ;;
  toggle|open|note) exec "$runtime" run scripts/run.ts "$action" "$@" ;;
  *) printf '%s\n' 'Usage: scripts/run.sh install|check|toggle|open|note' >&2; exit 2 ;;
esac
