param(
  [int]$Season = 2026,
  [switch]$Force = $false,
  [int]$Limit = 0,
  [int]$Width = 200,
  [int]$Height = 130,
  [int]$DetailWidth = 400,
  [int]$DetailHeight = 300
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Resolve-Path (Join-Path $scriptDir "..")

$py = Join-Path $backendDir ".venv\\Scripts\\python.exe"
if (!(Test-Path $py)) {
  $py = "python"
}

Push-Location $backendDir
try {
  $argsList = @(
    "-m", "app.cli", "update-circuits",
    "--season", "$Season",
    "--width", "$Width", "--height", "$Height",
    "--detail-width", "$DetailWidth", "--detail-height", "$DetailHeight"
  )
  if ($Force) { $argsList += "--force" }
  if ($Limit -gt 0) { $argsList += @("--limit", "$Limit") }
  & $py @argsList
} finally {
  Pop-Location
}
