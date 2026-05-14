function formatNumber(v, digits = 0) {
  if (Number.isNaN(v) || v === null || v === undefined) return "-"
  return Number(v).toFixed(digits)
}

function formatSpeedKph(v) {
  return `${formatNumber(v, 0)} km/h`
}

function formatRpm(v) {
  return `${formatNumber(v, 0)} rpm`
}

function formatPercent(v) {
  return `${formatNumber(v, 0)}%`
}

function formatGear(v) {
  if (!Number.isFinite(v)) return "-"
  if (v <= 0) return "N"
  return String(Math.round(v))
}

module.exports = {
  formatNumber,
  formatSpeedKph,
  formatRpm,
  formatPercent,
  formatGear
}

