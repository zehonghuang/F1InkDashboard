const { requestJson } = require("./request")

function mapSession(v) {
  const s = v || null
  if (!s) return null
  return {
    key: s.key || "",
    nameCN: s.name_cn || "",
    nameEN: s.name_en || "",
    startUTC: s.start_utc || "",
    startLocal: s.start_local || "",
    status: s.status || "upcoming",
    disabled: !!s.disabled,
    openF1SessionKey: Number(s.openf1_session_key) || 0
  }
}

async function fetchRaceSessions({ season, round, tz } = {}) {
  const y = Number(season) || 0
  const rd = Number(round) || 0
  const tzName = tz || "Asia/Shanghai"
  const q = []
  if (y > 0) q.push(`season=${encodeURIComponent(String(y))}`)
  if (rd > 0) q.push(`round=${encodeURIComponent(String(rd))}`)
  q.push(`tz=${encodeURIComponent(tzName)}`)
  const qs = q.length ? `?${q.join("&")}` : ""
  const r = await requestJson(`/api/v1/mp/race-sessions${qs}`, { method: "GET", needAuth: false })
  return {
    season: Number(r && r.season) || y,
    round: Number(r && r.round) || rd,
    raceName: (r && r.race_name) || "",
    tz: (r && r.tz) || tzName,
    generatedAtUTC: (r && r.generated_at_utc) || "",
    sessions: Array.isArray(r && r.sessions) ? r.sessions.map(mapSession).filter(Boolean) : []
  }
}

module.exports = {
  fetchRaceSessions
}
