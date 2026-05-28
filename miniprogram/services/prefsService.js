const { requestJson } = require("./request")

function normalizeTeamKeys(v) {
  const arr = Array.isArray(v) ? v : []
  const out = []
  const seen = new Set()
  for (const x of arr) {
    const s = String(x || "").trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  out.sort()
  return out
}

function normalizeDriverNumbers(v) {
  const arr = Array.isArray(v) ? v : []
  const out = []
  const seen = new Set()
  for (const x of arr) {
    const n = Number(x)
    if (!Number.isFinite(n) || n <= 0 || n > 999) continue
    const k = String(n)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(n)
  }
  out.sort((a, b) => a - b)
  return out
}

async function fetchPrefs() {
  const r = await requestJson("/api/v1/mp/auth/prefs", { method: "GET", needAuth: true })
  const prefs = (r && r.prefs) || {}
  return {
    teamKeys: normalizeTeamKeys(prefs.team_keys || (prefs.team_name ? [prefs.team_name] : [])),
    driverNumbers: normalizeDriverNumbers(prefs.driver_numbers || [])
  }
}

async function updatePrefs({ teamKeys, driverNumbers }) {
  const payload = {
    team_keys: normalizeTeamKeys(teamKeys || []),
    driver_numbers: normalizeDriverNumbers(driverNumbers || [])
  }
  const r = await requestJson("/api/v1/mp/auth/prefs", { method: "PUT", needAuth: true, data: payload })
  return r
}

module.exports = {
  fetchPrefs,
  updatePrefs
}

