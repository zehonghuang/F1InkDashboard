$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$fontDir = Join-Path $root "font"
$ttf = Join-Path $fontDir "Formula1-Bold_web_0.ttf"
$outDir = Join-Path $root "main\components\u8g2-fonts\src"
$outHeader = Join-Path $root "main\components\u8g2-fonts\include\u8g2_fonts.h"

if (!(Test-Path $ttf)) {
  throw "TTF not found: $ttf"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$img = "zectrix-u8g2-fonttools:latest"
docker build -t $img (Join-Path $root "scripts\u8g2_font") | Out-Host

$sizes = @(14, 16)
foreach ($pt in $sizes) {
  $bdfName = "Formula1_${pt}_ascii.bdf"
  $cName = "u8g2_font_formula1_${pt}_ascii.c"
  $bdfPath = Join-Path $outDir $bdfName
  $cPath = Join-Path $outDir $cName
  $sym = "u8g2_font_formula1_${pt}_ascii"

  docker run --rm `
    -v "${fontDir}:/in" `
    -v "${outDir}:/out" `
    $img `
    "/opt/u8g2/tools/font/otf2bdf/otf2bdf -p $pt -r 72 -l '32_126' -o /out/$bdfName /in/Formula1-Bold_web_0.ttf"

  docker run --rm `
    -v "${outDir}:/out" `
    $img `
    "/opt/u8g2/tools/font/bdfconv/bdfconv /out/$bdfName -f 1 -m '32-126' -n $sym -o /out/$cName"
}

Write-Host "Generated:"
Get-ChildItem $outDir -Filter "u8g2_font_formula1_*_ascii.c" | ForEach-Object { Write-Host ("- " + $_.FullName) }

