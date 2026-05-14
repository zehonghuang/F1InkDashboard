function loadMockTelemetry() {
  return require("../assets/mock/telemetry-session")
}

function downsample(samples, maxPoints) {
  if (!Array.isArray(samples)) return []
  if (samples.length <= maxPoints) return samples
  const step = Math.ceil(samples.length / maxPoints)
  const out = []
  for (let i = 0; i < samples.length; i += step) {
    out.push(samples[i])
  }
  const last = samples[samples.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

function pickXAxis(samples) {
  const first = samples && samples[0]
  if (first && typeof first.distance === "number") return { key: "distance", unit: "m" }
  return { key: "t", unit: "s" }
}

function getLatest(samples) {
  if (!samples || !samples.length) return undefined
  return samples[samples.length - 1]
}

function computeLapTimes(samples) {
  const byLap = new Map()
  for (const s of samples || []) {
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
  const out = []
  for (const [lap, t] of byLap.entries()) {
    out.push({ lap, lapTimeSec: Math.max(0, t.t1 - t.t0) })
  }
  out.sort((a, b) => a.lap - b.lap)
  return out
}

module.exports = {
  loadMockTelemetry,
  downsample,
  pickXAxis,
  getLatest,
  computeLapTimes
}
