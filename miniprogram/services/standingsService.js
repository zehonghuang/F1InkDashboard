const { requestJson } = require("./request")

async function fetchStandings(season) {
  const y = Number(season)
  const q = Number.isFinite(y) && y > 0 ? `?season=${y}` : ""
  const r = await requestJson(`/api/v1/mp/standings${q}`, { method: "GET", needAuth: false })
  return {
    season: Number((r && r.season) || y) || y,
    sessionKey: Number((r && r.session_key) || 0),
    drivers: Array.isArray(r && r.drivers) ? r.drivers : [],
    constructors: Array.isArray(r && r.constructors) ? r.constructors : [],
    generatedAtUTC: (r && r.generated_at_utc) || ""
  }
}

module.exports = { fetchStandings }

