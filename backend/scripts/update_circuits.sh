#!/usr/bin/env bash
set -euo pipefail

SEASON="${1:-2026}"
FORCE="${FORCE:-0}"
LIMIT="${LIMIT:-0}"
WIDTH="${WIDTH:-200}"
HEIGHT="${HEIGHT:-130}"
DETAIL_WIDTH="${DETAIL_WIDTH:-400}"
DETAIL_HEIGHT="${DETAIL_HEIGHT:-300}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PY="${BACKEND_DIR}/.venv/bin/python"
if [[ ! -x "${PY}" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PY="python3"
  else
    PY="python"
  fi
fi

cd "${BACKEND_DIR}"

ARGS=( -m app.cli update-circuits --season "${SEASON}" --width "${WIDTH}" --height "${HEIGHT}" --detail-width "${DETAIL_WIDTH}" --detail-height "${DETAIL_HEIGHT}" )
if [[ "${FORCE}" != "0" ]]; then
  ARGS+=( --force )
fi
if [[ "${LIMIT}" != "0" ]]; then
  ARGS+=( --limit "${LIMIT}" )
fi

"${PY}" "${ARGS[@]}"
