const { requestJson, getApiBase } = require("./request")

function joinUrl(base, path) {
  const p = String(path || "")
  if (!p) return ""
  if (/^https?:\/\//i.test(p)) return p
  const b = String(base || "").replace(/\/+$/, "")
  if (!b) return p
  if (p.startsWith("/")) return `${b}${p}`
  return `${b}/${p}`
}

function mapRace(v, baseUrl) {
  const r = v || null
  if (!r) return null
  return {
    season: Number(r.season) || 0,
    round: Number(r.round) || 0,
    raceName: r.race_name || "",
    country: r.country || "",
    flagUrl: joinUrl(baseUrl, r.flag_url || ""),
    raceDateUTC: r.race_date_utc || "",
    raceDateLocal: r.race_date_local || "",
    openF1RaceSessionKey: Number(r.openf1_race_session_key) || 0
  }
}

function mapNextSession(v) {
  const s = v || null
  if (!s) return null
  return {
    key: s.key || "",
    startsAtUTC: s.starts_at_utc || "",
    startsAtLocal: s.starts_at_local || "",
    inText: s.in || "",
    seconds: Number(s.seconds) || 0,
    openF1SessionKey: Number(s.openf1_session_key) || 0
  }
}

async function fetchRaceWeek({ season, tz } = {}) {
  const y = Number(season) || 0
  const tzName = tz || "Asia/Shanghai"
  const apiBase = getApiBase()
  const q = []
  if (y > 0) q.push(`season=${encodeURIComponent(String(y))}`)
  q.push(`tz=${encodeURIComponent(tzName)}`)
  const qs = q.length ? `?${q.join("&")}` : ""
  const r = await requestJson(`/api/v1/mp/race-week${qs}`, { method: "GET", needAuth: false })
  return {
    season: Number(r && r.season) || y,
    tz: (r && r.tz) || tzName,
    weekStartLocal: (r && r.week_start_local) || "",
    weekEndLocal: (r && r.week_end_local) || "",
    isRaceWeek: Boolean(r && r.is_race_week),
    race: mapRace(r && r.race, apiBase),
    nextSession: mapNextSession(r && r.next_session),
    generatedAtUTC: (r && r.generated_at_utc) || ""
  }
}

module.exports = { fetchRaceWeek }
