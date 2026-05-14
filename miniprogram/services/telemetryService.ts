export type TelemetrySession = {
  id: string
  name: string
  track: string
  vehicle: string
  startTime: string
  lapCount: number
}

export type TelemetrySample = {
  sessionId: string
  t?: number
  distance?: number
  speed?: number
  rpm?: number
  throttle?: number
  brake?: number
  gear?: number
  lap?: number
}

export type TelemetryData = {
  session: TelemetrySession
  samples: TelemetrySample[]
}

export function loadMockTelemetry(): TelemetryData {
  const data = require("../assets/mock/telemetry-session") as TelemetryData
  return data
}

export function downsample(samples: TelemetrySample[], maxPoints: number): TelemetrySample[] {
  if (samples.length <= maxPoints) return samples
  const step = Math.ceil(samples.length / maxPoints)
  const out: TelemetrySample[] = []
  for (let i = 0; i < samples.length; i += step) {
    out.push(samples[i])
  }
  const last = samples[samples.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

export function pickXAxis(samples: TelemetrySample[]): { key: "distance" | "t"; unit: string } {
  const first = samples[0]
  if (first && typeof first.distance === "number") return { key: "distance", unit: "m" }
  return { key: "t", unit: "s" }
}

export function getLatest(samples: TelemetrySample[]): TelemetrySample | undefined {
  if (!samples.length) return undefined
  return samples[samples.length - 1]
}

export function computeLapTimes(samples: TelemetrySample[]): { lap: number; lapTimeSec: number }[] {
  const byLap = new Map<number, { t0: number; t1: number }>()
  for (const s of samples) {
    if (typeof s.lap !== "number" || typeof s.t !== "number") continue
    const lap = Math.round(s.lap)
    const cur = byLap.get(lap)
    if (!cur) {
      byLap.set(lap, { t0: s.t, t1: s.t })
      continue
    }
    if (s.t < cur.t0) cur.t0 = s.t
    if (s.t > cur.t1) cur.t1 = s.t
  }
  const out: { lap: number; lapTimeSec: number }[] = []
  for (const [lap, t] of byLap.entries()) {
    out.push({ lap, lapTimeSec: Math.max(0, t.t1 - t.t0) })
  }
  out.sort((a, b) => a.lap - b.lap)
  return out
}
