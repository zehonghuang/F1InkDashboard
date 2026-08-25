const { fetchStandings } = require("../../../../services/standingsService")
const i18n = require("../../../../services/i18n")

function formatPoints(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "-"
  const i = Math.round(n)
  if (Math.abs(n - i) < 1e-9) return String(i)
  return String(Math.round(n * 10) / 10)
}

function normalizeTeamColor(v) {
  const s = String(v || "").trim()
  if (!s) return ""
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase()
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`.toUpperCase()
  return ""
}

function hexToRgba(hex, alpha) {
  const h = normalizeTeamColor(hex)
  if (!h) return ""
  const r = parseInt(h.slice(1, 3), 16)
  const g = parseInt(h.slice(3, 5), 16)
  const b = parseInt(h.slice(5, 7), 16)
  const a = Number.isFinite(Number(alpha)) ? Math.max(0, Math.min(1, Number(alpha))) : 1
  return `rgba(${r},${g},${b},${a})`
}

function withCardStyle(items) {
  const rows = Array.isArray(items) ? items : []
  let leaderPoints = 0
  for (const it of rows) {
    const val = Number(it && it.points)
    if (Number.isFinite(val) && val > leaderPoints) leaderPoints = val
  }
  return rows.map((it, index) => {
    const rank = index + 1
    const c = normalizeTeamColor(it && it.team_color)
    const pointsValue = Number(it && it.points)
    const leaderDelta = Number.isFinite(pointsValue) ? Math.max(0, leaderPoints - pointsValue) : 0
    const progressRatio = leaderPoints > 0 && Number.isFinite(pointsValue) ? Math.max(0.08, Math.min(1, pointsValue / leaderPoints)) : 0.08
    const fillStart = hexToRgba(c, 0.3) || "rgba(225, 6, 0, 0.24)"
    const fillEnd = c || "#E10600"
    const accentStyle = c ? `background:${c};` : ""
    const avatarShellStyle = c
      ? `background: linear-gradient(180deg, ${hexToRgba(c, 0.22)} 0%, rgba(255,255,255,0.05) 100%); border-color: ${hexToRgba(c, 0.22)};`
      : ""
    const progressStyle = `width:${Math.round(progressRatio * 100)}%; background: linear-gradient(90deg, ${fillStart} 0%, ${fillEnd} 100%);`
    return Object.assign({}, it, {
      rank,
      rankLabel: `P${rank}`,
      topTier: rank <= 3 ? `top-${rank}` : "",
      isLeader: rank === 1,
      accentStyle,
      avatarShellStyle,
      progressStyle,
      gapPoints: leaderDelta > 0 ? formatPoints(leaderDelta) : "",
      pointsValue: Number.isFinite(pointsValue) ? pointsValue : 0,
      points: formatPoints(it && it.points)
    })
  })
}

Page({
  data: {
    i18n: i18n.getDict(),
    season: 2026,
    tabs: [],
    activeTabKey: "drivers",
    drivers: [],
    constructors: [],
    leaderDriver: null,
    leaderConstructor: null,
    loading: false,
    errorText: "",
    updatedText: "",
    subtitleText: ""
  },
  onLoad(options) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    const season = Number((options && options.season) || 0) || 2026
    this.setData({ season }, () => {
      this.applyI18n()
      this.refresh()
    })
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n()
  },
  onPullDownRefresh() {
    Promise.resolve(this.refresh()).finally(() => {
      try {
        wx.stopPullDownRefresh()
      } catch (e) {}
    })
  },
  onTabTap(e) {
    const key = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.tab : ""
    if (!key) return
    this.setData({ activeTabKey: key })
  },
  async refresh() {
    if (this.data.loading) return
    this.setData({ loading: true, errorText: "" })
    try {
      const r = await fetchStandings(this.data.season)
      const drivers = withCardStyle(r.drivers || [])
      const constructors = withCardStyle(r.constructors || [])
      const ts = r.generatedAtUTC ? String(r.generatedAtUTC).replace("T", " ").replace("Z", "") : ""
      const updatedText = ts ? i18n.t("standings.updatedAtUTC", { ts }) : ""
      this.setData({
        drivers,
        constructors,
        leaderDriver: drivers[0] || null,
        leaderConstructor: constructors[0] || null,
        updatedText
      })
      if (!drivers.length && !constructors.length) {
        this.setData({ errorText: i18n.t("standings.noData") })
      }
    } catch (e) {
      this.setData({ errorText: i18n.t("standings.loadFailed") })
    } finally {
      this.setData({ loading: false })
    }
  },
  applyI18n() {
    const dict = i18n.getDict()
    const tabs = [
      { key: "drivers", label: dict.standings.drivers },
      { key: "constructors", label: dict.standings.teams }
    ]
    const subtitleText = i18n.t("standings.subtitle", { season: this.data.season })
    this.setData({ i18n: dict, tabs, subtitleText })
    wx.setNavigationBarTitle({ title: dict.standings.title })
  }
})

