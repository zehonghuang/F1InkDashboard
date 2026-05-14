export function formatNumber(v: number, digits = 0): string {
  if (Number.isNaN(v) || v === null || v === undefined) return "-"
  return v.toFixed(digits)
}

export function formatSpeedKph(v: number): string {
  return `${formatNumber(v, 0)} km/h`
}

export function formatRpm(v: number): string {
  return `${formatNumber(v, 0)} rpm`
}

export function formatPercent(v: number): string {
  return `${formatNumber(v, 0)}%`
}

export function formatGear(v: number): string {
  if (!Number.isFinite(v)) return "-"
  if (v <= 0) return "N"
  return String(Math.round(v))
}

