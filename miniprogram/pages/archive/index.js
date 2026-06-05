const i18n = require("../../services/i18n")

Page({
  data: {
    i18n: i18n.getDict(),
    query: "",
    seasonOptions: [],
    seasonIndex: 0,
    statusBarHeight: 0,
    races: [
      {
        id: "R07",
        round: 7,
        roundText: "R07",
        name: "Monaco Grand Prix",
        date: "05.24",
        dateShort: "05.24",
        thumb: "/assets/circuits/2026/maps/monaco_map.png",
        winner: i18n.t("archive.pending"),
        fastestLap: "1:32.405"
      },
      {
        id: "R06",
        round: 6,
        roundText: "R06",
        name: "Miami Grand Prix",
        date: "05.03",
        dateShort: "05.03",
        thumb: "/assets/circuits/2026/maps/miami_map.png",
        winner: i18n.t("archive.pending"),
        fastestLap: "1:29.802"
      },
      {
        id: "R05",
        round: 5,
        roundText: "R05",
        name: "Chinese Grand Prix",
        date: "04.19",
        dateShort: "04.19",
        thumb: "/assets/circuits/2026/maps/shanghai_map.png",
        winner: i18n.t("archive.pending"),
        fastestLap: "1:37.521"
      },
      {
        id: "R04",
        round: 4,
        roundText: "R04",
        name: "Japanese Grand Prix",
        date: "04.05",
        dateShort: "04.05",
        thumb: "/assets/circuits/2026/maps/suzuka_map.png",
        winner: i18n.t("archive.pending"),
        fastestLap: "1:33.784"
      }
    ]
  },
  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.applyI18n()
    this.loadArchive()
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onPullDownRefresh() {
    this.loadArchive({ isPullDown: true })
  },
  onShow() {
    if (typeof this.getTabBar === 'function') {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === 'function') {
        tb.setSelectedByRoute(this.route)
      }
    }
    this.applyI18n()
  },
  applyI18n() {
    const dict = i18n.getDict()
    const years = [2026, 2025, 2024, 2023]
    const suffix = dict.archive.seasonSuffix || ""
    const withSpace = suffix && /[a-z]/i.test(suffix)
    const seasonOptions = years.map((y) => `${y}${withSpace ? " " : ""}${suffix}`)
    this.setData({ i18n: dict, seasonOptions })
    wx.setNavigationBarTitle({ title: dict.nav.archive })
  },
  onSeasonChange(e) {
    const idx = Number(e.detail.value || 0)
    this.setData({ seasonIndex: idx }, () => this.loadArchive())
  },
  formatDateShort(v) {
    const s = String(v || "").trim()
    if (!s) return ""
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[2]}.${m[3]}`
    const md = s.match(/^(\d{1,2})\.(\d{1,2})/)
    if (md) {
      const mm = String(md[1]).padStart(2, "0")
      const dd = String(md[2]).padStart(2, "0")
      return `${mm}.${dd}`
    }
    return s.slice(0, 10)
  },
  loadArchive(opts) {
    const done = () => {
      if (opts && opts.isPullDown) {
        wx.stopPullDownRefresh()
      }
    }
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    if (!apiBase) {
      done()
      return
    }
    const seasons = [2026, 2025, 2024, 2023]
    const season = seasons[this.data.seasonIndex] || seasons[0]
    const url = `${apiBase.replace(/\/+$/, "")}/api/v1/mp/archive?season=${season}&tz=Asia/Shanghai`
    wx.request({
      url,
      method: "GET",
      header: { "Accept-Language": i18n.getLocale() },
      success: (res) => {
        const data = (res && res.data) || {}
        const races = Array.isArray(data.races) ? data.races : []
        if (!races.length) {
          done()
          return
        }
        const pending = i18n.t("archive.pending")
        const mapped = races.map((it) => {
          const round = Number(it.round || 0)
          const winner = (it.winner && (it.winner.name_acronym || it.winner.full_name || it.winner.driver_number)) || pending
          const fastestLap = (it.fastest_lap && it.fastest_lap.time) || pending
          const thumb = (it.circuit && (it.circuit.map_image_url || it.circuit.map_image_url_thumb)) || ""
          const thumbFallback = (it.circuit && (it.circuit.map_image_url || it.circuit.map_image_url_thumb)) || ""
          const date = it.date_local || it.date_utc || ""
          const dateShort = this.formatDateShort(date)
          return {
            id: round ? `R${String(round).padStart(2, "0")}` : "",
            round,
            roundText: round ? `R${String(round).padStart(2, "0")}` : "",
            name: it.race_name || "",
            date,
            dateShort,
            thumb,
            thumbFallback,
            winner: String(winner),
            fastestLap: String(fastestLap)
          }
        })
        this.setData({ races: mapped })
        done()
      },
      fail: () => {
        done()
      }
    })
  },
  onRaceTap(e) {
    const { name, round } = e.currentTarget.dataset
    const seasons = [2026, 2025, 2024, 2023]
    const season = seasons[this.data.seasonIndex] || seasons[0]
    const rd = Number(round || 0)
    if (!rd) {
      return
    }
    wx.navigateTo({
      url: `/pages/race-sessions/index?season=${season}&round=${rd}&raceName=${encodeURIComponent(name || "")}`
    })
  },
  onQueryInput(e) {
    this.setData({ query: e.detail.value })
  },
  onSearch() {
    const q = (this.data.query || "").trim()
    wx.showToast({
      title: q ? `${i18n.t("archive.searchPrefix")}${q}` : i18n.t("archive.searchPlaceholder"),
      icon: "none"
    })
  }
})
