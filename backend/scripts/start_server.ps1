param(
    [string]$BackendBin = ""
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:BACKEND_LISTEN_ADDR) { $env:BACKEND_LISTEN_ADDR = ":8008" }
if (-not $env:BACKEND_STATIC_DIR) { $env:BACKEND_STATIC_DIR = ".\\static" }
if (-not $env:BACKEND_UPDATE_DIR) { $env:BACKEND_UPDATE_DIR = "" }

if (-not $env:MP_NEWS_SCHEDULER_ENABLED) { $env:MP_NEWS_SCHEDULER_ENABLED = "true" }


if (-not $env:TOINC_F1_MYSQL_ENABLED) { $env:TOINC_F1_MYSQL_ENABLED = "1" }
if (-not $env:TOINC_F1_MYSQL_HOST) { $env:TOINC_F1_MYSQL_HOST = "127.0.0.1" }
if (-not $env:TOINC_F1_MYSQL_PORT) { $env:TOINC_F1_MYSQL_PORT = "3306" }
if (-not $env:TOINC_F1_MYSQL_USER) { $env:TOINC_F1_MYSQL_USER = "root" }
if (-not $env:TOINC_F1_MYSQL_PASSWORD) { $env:TOINC_F1_MYSQL_PASSWORD = "123456" }
if (-not $env:TOINC_F1_MYSQL_DB) { $env:TOINC_F1_MYSQL_DB = "toinc_F1" }
if (-not $env:TOINC_F1_MYSQL_CHARSET) { $env:TOINC_F1_MYSQL_CHARSET = "utf8mb4" }

if (-not $env:OPENF1_SCHEDULER_ENABLED) { $env:OPENF1_SCHEDULER_ENABLED = "true" }


if (-not $env:MOTORSPORT_LIVE_ENABLED) { $env:MOTORSPORT_LIVE_ENABLED = "true" }
if (-not $env:F1_LIVE_TIMING_ENABLED) { $env:F1_LIVE_TIMING_ENABLED = "true" }


if ($BackendBin) {
    & $BackendBin
    exit $LASTEXITCODE
}

if ($env:BACKEND_BIN) {
    & $env:BACKEND_BIN
    exit $LASTEXITCODE
}

if (Test-Path ".\\bin\\server.exe") {
    & ".\\bin\\server.exe"
    exit $LASTEXITCODE
}

go run .\\cmd\\server
