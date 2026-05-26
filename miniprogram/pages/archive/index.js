Page({
  data: {
    query: "",
    seasonOptions: ["2026赛季", "2025赛季", "2024赛季", "2023赛季"],
    seasonIndex: 0,
    statusBarHeight: 0,
    races: [
      {
        id: "R07",
        name: "Monaco Grand Prix",
        date: "05.24",
        thumb: "/assets/circuits/2026/maps/monaco_map.png",
        winner: "待更新",
        fastestLap: "1:32.405"
      },
      {
        id: "R06",
        name: "Miami Grand Prix",
        date: "05.03",
        thumb: "/assets/circuits/2026/maps/miami_map.png",
        winner: "待更新",
        fastestLap: "1:29.802"
      },
      {
        id: "R05",
        name: "Chinese Grand Prix",
        date: "04.19",
        thumb: "/assets/circuits/2026/maps/shanghai_map.png",
        winner: "待更新",
        fastestLap: "1:37.521"
      },
      {
        id: "R04",
        name: "Japanese Grand Prix",
        date: "04.05",
        thumb: "/assets/circuits/2026/maps/suzuka_map.png",
        winner: "待更新",
        fastestLap: "1:33.784"
      }
    ]
  },
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.loadArchive()
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
  },
  onSeasonChange(e) {
    const idx = Number(e.detail.value || 0)
    this.setData({ seasonIndex: idx }, () => this.loadArchive())
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
      success: (res) => {
        const data = (res && res.data) || {}
        const races = Array.isArray(data.races) ? data.races : []
        if (!races.length) {
          done()
          return
        }
        const mapped = races.map((it) => {
          const round = Number(it.round || 0)
          const winner = (it.winner && (it.winner.name_acronym || it.winner.full_name || it.winner.driver_number)) || "待更新"
          const fastestLap = (it.fastest_lap && it.fastest_lap.time) || "待更新"
          const thumb = (it.circuit && (it.circuit.map_image_url || it.circuit.map_image_url_thumb)) || ""
          const thumbFallback = (it.circuit && (it.circuit.map_image_url || it.circuit.map_image_url_thumb)) || ""
          return {
            id: round ? `R${String(round).padStart(2, "0")}` : "",
            round,
            name: it.race_name || "",
            date: it.date_local || "",
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
      title: q ? `检索: ${q}` : "请输入赛道或日期",
      icon: "none"
    })
  }
})
