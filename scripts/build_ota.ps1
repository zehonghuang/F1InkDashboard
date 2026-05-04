param(
    [string]$BoardType = "zectrix-s3-epaper-4.2",
    [string]$BuildName = "",
    [string]$BackendUpdateDir = ".\backend\static\update",
    [string]$OutBinName = "app.bin",
    [string]$ManifestFile = ".\backend\static\update\manifest.json",
    [string]$Version = "",
    [string]$IdfProfile = "C:\Espressif\tools\Microsoft.v5.4.4.PowerShell_profile.ps1"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if ([string]::IsNullOrWhiteSpace($BuildName)) {
    $BuildName = $BoardType
}

if (Test-Path $IdfProfile) {
    . $IdfProfile
} elseif ($env:IDF_PATH -and (Test-Path (Join-Path $env:IDF_PATH "export.ps1"))) {
    . (Join-Path $env:IDF_PATH "export.ps1")
} else {
    throw "ESP-IDF environment not found. Set IDF_PATH or install Espressif tools (PowerShell profile)."
}

$appBinCandidates = @(
    ".\build\xiaozhi.bin",
    ".\build\app.bin"
)

Write-Host "[1/3] Build firmware ($BoardType / $BuildName)"
python .\scripts\release.py $BoardType --name $BuildName
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] release.py failed, fallback to idf.py build + merge-bin"
    idf.py build
    if ($LASTEXITCODE -ne 0) { throw "idf.py build failed" }
}

$srcBin = $null
foreach ($p in $appBinCandidates) {
    if (Test-Path $p) { $srcBin = $p; break }
}
if (-not $srcBin) {
    $bins = Get-ChildItem -Path ".\build" -Filter "*.bin" -File -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -notin @("bootloader.bin", "partition-table.bin", "merged-binary.bin")
    }
    if ($bins -and $bins.Count -gt 0) {
        $srcBin = $bins[0].FullName
    }
}
if (-not $srcBin) {
    throw "App binary not found under .\build (expected xiaozhi.bin or app.bin)"
}

Write-Host "[2/3] Copy OTA bin + write manifest"
New-Item -ItemType Directory -Force -Path $BackendUpdateDir | Out-Null
$dstBin = Join-Path $BackendUpdateDir $OutBinName
Copy-Item -Force $srcBin $dstBin

if ([string]::IsNullOrWhiteSpace($Version)) {
    $cmake = Get-Content -Raw ".\CMakeLists.txt"
    $m = [regex]::Match($cmake, 'set\(PROJECT_VER\s+"([^"]+)"\)')
    if ($m.Success) {
        $Version = $m.Groups[1].Value
    } else {
        throw "Version not provided and PROJECT_VER not found in CMakeLists.txt"
    }
}

$hash = (Get-FileHash -Algorithm SHA256 $dstBin).Hash.ToLower()
$size = (Get-Item $dstBin).Length

$obj = [ordered]@{
    version = $Version
    board = $BoardType
    bin_url = $OutBinName
    sha256 = $hash
    size = $size
}
$json = ($obj | ConvertTo-Json -Depth 5)
New-Item -ItemType Directory -Force -Path (Split-Path $ManifestFile -Parent) | Out-Null
[System.IO.File]::WriteAllText((Resolve-Path $ManifestFile), $json + "`n", [System.Text.Encoding]::UTF8)

Write-Host "[3/3] Done"
Write-Host "[OK] OTA bin: $dstBin"
Write-Host "[OK] Manifest: $ManifestFile"
