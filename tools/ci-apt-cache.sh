#!/usr/bin/env bash
# Reuse the .deb archives behind `playwright install --with-deps` (OPT-INV-001 invariant-driven reuse).
#
# Invariant: the archives apt downloads are identified exactly by their filenames and SHA-256 sums in
# the apt index. The plan below lists precisely the files apt would fetch for Playwright's own package
# list, and its hash is the cache key. Restored files are checked against the plan before use. A file
# that does not match is deleted and downloaded again. apt re-verifies archives against its index too.
#
# Usage (CI):
#   tools/ci-apt-cache.sh plan    <playwright-bin> <plan-file>  # apt-get update; write plan; print key hash
#   tools/ci-apt-cache.sh install <playwright-bin> <plan-file> <deb-dir>
#   tools/ci-apt-cache.sh verify  <plan-file> <deb-dir>          # every planned archive present and exact
# QWAKE_APT_PACKAGES overrides the package list (used to test this script).
set -euo pipefail
SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"

packages() {
  if [ -n "${QWAKE_APT_PACKAGES:-}" ]; then echo "$QWAKE_APT_PACKAGES"; return; fi
  # The exact package list --with-deps installs, as printed by the pinned Playwright itself.
  local out; out=$("$1" install-deps --dry-run chromium)
  local list; list=$(printf '%s\n' "$out" | sed -n 's/.*apt-get install -y --no-install-recommends \([^"]*\)".*/\1/p')
  [ -n "$list" ] || { echo "could not read Playwright's dependency list from: $out" >&2; exit 1; }
  echo "$list"
}

plan() { # <playwright-bin> <plan-file>
  local pkgs; pkgs=$(packages "$1")
  $SUDO apt-get update -qq
  # Archives apt would download now (already-installed packages are not listed).
  apt-get install --print-uris -qq -y --no-install-recommends $pkgs | while read -r uri file size _; do
    [ -n "$file" ] || continue
    local name="${file%%_*}"
    # SHA-256 from the apt index for this exact file. Match on the pool basename from the URI:
    # the local archive name encodes an epoch ("1%3a1.0.5") that the index Filename omits.
    local pool; pool=$(basename "${uri//\'/}")
    local sha; sha=$(apt-cache show --no-all-versions "$name" | awk -v f="$pool" '
      /^Filename:/ { n = split($2, p, "/"); cur = p[n] } /^SHA256:/ && cur == f { print $2; exit }')
    [ -n "$sha" ] || { echo "no SHA256 in the apt index for $file" >&2; exit 1; }
    echo "$file $size $sha"
  done | sort > "$2"
  echo "planned archives: $(wc -l < "$2")" >&2
  sha256sum "$2" | cut -c1-64
}

check() { # <plan-file> <deb-dir> <mode: prune|strict>
  local bad=0 ok=0
  while read -r file size sha; do
    local f="$2/$file"
    if [ ! -f "$f" ]; then
      [ "$3" = strict ] && { echo "missing archive: $file" >&2; bad=1; }
      continue
    fi
    if [ "$(stat -c %s "$f")" = "$size" ] && [ "$(sha256sum "$f" | cut -c1-64)" = "$sha" ]; then ok=$((ok + 1)); continue; fi
    echo "archive does not match the apt index: $file" >&2
    if [ "$3" = strict ]; then bad=1; else $SUDO rm -f "$f"; fi
  done < "$1"
  echo "verified archives: $ok" >&2
  return $bad
}

install() { # <playwright-bin> <plan-file> <deb-dir>
  local pkgs; pkgs=$(packages "$1")
  mkdir -p "$3"; $SUDO mkdir -p "$3/partial"
  check "$2" "$3" prune
  # Same command as --with-deps, with the archive cache pointed at the reusable directory.
  $SUDO apt-get install -y --no-install-recommends \
    -o Dir::Cache::Archives="$3" -o APT::Keep-Downloaded-Packages=true $pkgs
  # Leave only readable archives behind for actions/cache.
  $SUDO rm -rf "$3/partial" "$3/lock"
  $SUDO chown -R "$(id -u):$(id -g)" "$3"
}

case "${1:-}" in
  plan) plan "$2" "$3" ;;
  install) install "$2" "$3" "$4" ;;
  verify) check "$2" "$3" strict ;;
  *) echo "usage: $0 plan|install|verify ..." >&2; exit 2 ;;
esac
