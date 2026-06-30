const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const projectRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(projectRoot, "..")

const src = path.join(repoRoot, "backend", "static", "assets", "tyres", "pirelli", "blue.png")
const outDir = path.join(projectRoot, "assets", "icons")
const dst = path.join(outDir, "tyre-blue-icon.png")

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" })
    return true
  } catch (e) {
    return false
  }
}

function main() {
  if (!fs.existsSync(src)) {
    throw new Error(`Blue tyre source not found: ${src}`)
  }

  fs.mkdirSync(outDir, { recursive: true })

  const escapedSrc = src.replace(/'/g, "''")
  const escapedDst = dst.replace(/'/g, "''")
  const ps = `
Add-Type -AssemblyName System.Drawing
$src = '${escapedSrc}'
$dst = '${escapedDst}'
$img = [System.Drawing.Bitmap]::FromFile($src)
try {
  $minX = $img.Width
  $minY = $img.Height
  $maxX = -1
  $maxY = -1
  for ($y = 0; $y -lt $img.Height; $y++) {
    for ($x = 0; $x -lt $img.Width; $x++) {
      $px = $img.GetPixel($x, $y)
      if ($px.A -gt 8) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt 0 -or $maxY -lt 0) { throw 'No visible pixels found in source image' }

  $cropW = $maxX - $minX + 1
  $cropH = $maxY - $minY + 1
  $cropRect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
  $cropped = $img.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $size = 96
    $padding = 4
    $target = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $g = [System.Drawing.Graphics]::FromImage($target)
      try {
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $fit = $size - $padding * 2
        $ratio = [Math]::Min($fit / $cropped.Width, $fit / $cropped.Height)
        $drawW = [int][Math]::Round($cropped.Width * $ratio)
        $drawH = [int][Math]::Round($cropped.Height * $ratio)
        $drawX = [int][Math]::Round(($size - $drawW) / 2)
        $drawY = [int][Math]::Round(($size - $drawH) / 2)
        $g.DrawImage($cropped, $drawX, $drawY, $drawW, $drawH)
      } finally {
        $g.Dispose()
      }
      $target.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $target.Dispose()
    }
  } finally {
    $cropped.Dispose()
  }
} finally {
  $img.Dispose()
}
`

  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { stdio: "inherit" })
  } catch (e) {
    if (!hasFfmpeg()) throw e
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        src,
        "-vf",
        "scale=96:96:force_original_aspect_ratio=decrease:eval=init,pad=96:96:(ow-iw)/2:(oh-ih)/2:color=black@0",
        dst
      ],
      { stdio: "inherit" }
    )
  }

  console.log(dst)
}

main()
