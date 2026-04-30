param(
    [string]$Port = "COM4",
    [string]$BuildDir = "build2"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "[1/3] Ensure ESP-IDF environment"
. "C:\Espressif\tools\Microsoft.v5.4.4.PowerShell_profile.ps1"

Write-Host "[2/3] Build SPIFFS assets.bin from main/assets"
$imagePath = ".\scripts\spiffs_assets\build\assets.bin"
New-Item -ItemType Directory -Force -Path (Split-Path $imagePath -Parent) | Out-Null
$assetsSize = "0x800000"
python "$env:IDF_PATH\components\spiffs\spiffsgen.py" $assetsSize ".\main\assets" $imagePath --page-size=256 --obj-name-len=32 --meta-len=4 --use-magic --use-magic-len

Write-Host "[3/3] Flash assets partition to $Port"
$partitionTableCandidates = @(
    ".\$BuildDir\partition_table\partition-table.bin",
    ".\build2\partition_table\partition-table.bin",
    ".\build\partition_table\partition-table.bin"
)

$partitionTableFile = $null
foreach ($candidate in $partitionTableCandidates) {
    if (Test-Path $candidate) {
        $partitionTableFile = $candidate
        break
    }
}

if (-not $partitionTableFile) {
    Write-Host "Partition table not found, generating with idf.py ..."
    idf.py -B $BuildDir partition-table
    if (Test-Path ".\$BuildDir\partition_table\partition-table.bin") {
        $partitionTableFile = ".\$BuildDir\partition_table\partition-table.bin"
    }
}

if (-not $partitionTableFile) {
    throw "partition-table.bin not found. Please run idf.py build once, then retry."
}

Write-Host "Using partition table: $partitionTableFile"

Write-Host "Erasing assets partition..."
parttool.py --port $Port --partition-table-file $partitionTableFile erase_partition --partition-name assets

parttool.py --port $Port --partition-table-file $partitionTableFile write_partition --partition-name assets --input $imagePath

Write-Host "Done."
