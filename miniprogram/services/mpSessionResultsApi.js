const { requestJson } = require("./request")

function mapLatestCrawledRow(v) {
  const it = v || {}
  return {
    pos: Number(it.pos) || 0,
    driver: it.driver || "",
    team: it.team || "",
    number: Number(it.number) || 0,
    laps: it.laps || "",
    time: it.time || "",
    gap: it.gap || "",
    interval: it.interval || "",
    tyre: it.tyre || "",
    teamColor: it.teamColor || "",
    carAccent: it.carAccent || it.teamColor || ""
  }
}

async function fetchLatestCrawledSessionResults() {
  const data = await requestJson("/api/v1/mp/session-results/latest-crawled", {
    method: "GET",
    needAuth: false
  })
  return {
    ok: Boolean(data && data.ok),
    title: (data && data.title) || "",
    sessionCode: (data && data.session_code) || "",
    sessionTitle: (data && data.session_title) || "",
    eventName: (data && data.event_name) || "",
    crawledAt: (data && data.crawled_at) || "",
    shouldDisplay: data && data.should_display !== false,
    hideAfterUTC: (data && data.hide_after_utc) || "",
    rows: Array.isArray(data && data.rows) ? data.rows.map(mapLatestCrawledRow) : []
  }
}

module.exports = {
  fetchLatestCrawledSessionResults
}
