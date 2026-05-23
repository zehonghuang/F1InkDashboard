#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${BACKEND_LISTEN_ADDR:=:8008}"
: "${BACKEND_STATIC_DIR:=./static}"
: "${BACKEND_UPDATE_DIR:=}"

: "${TOINC_F1_MYSQL_ENABLED:=1}"
: "${TOINC_F1_MYSQL_HOST:=127.0.0.1}"
: "${TOINC_F1_MYSQL_PORT:=3306}"
: "${TOINC_F1_MYSQL_USER:=root}"
: "${TOINC_F1_MYSQL_PASSWORD:=123456}"
: "${TOINC_F1_MYSQL_DB:=toinc_F1}"
: "${TOINC_F1_MYSQL_CHARSET:=utf8mb4}"

export BACKEND_LISTEN_ADDR BACKEND_STATIC_DIR BACKEND_UPDATE_DIR
export TOINC_F1_MYSQL_ENABLED TOINC_F1_MYSQL_HOST TOINC_F1_MYSQL_PORT TOINC_F1_MYSQL_USER TOINC_F1_MYSQL_PASSWORD TOINC_F1_MYSQL_DB TOINC_F1_MYSQL_CHARSET

if [[ -n "${BACKEND_BIN:-}" ]]; then
	exec "$BACKEND_BIN"
fi

if [[ -x "./bin/server" ]]; then
	exec "./bin/server"
fi

exec go run ./cmd/server
