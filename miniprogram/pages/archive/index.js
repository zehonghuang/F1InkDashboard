Page({
  data: {
    query: "",
    seasonOptions: ["2026赛季", "2025赛季", "2024赛季", "2023赛季"],
    seasonIndex: 0,
    races: [
      {
        id: "R07",
        name: "Monaco Grand Prix",
        date: "05.24",
        thumb: "/assets/circuits/2026/raw/monaco_map.webp",
        winner: "待更新",
        fastestLap: "1:32.405"
      },
      {
        id: "R06",
        name: "Miami Grand Prix",
        date: "05.03",
        thumb: "/assets/circuits/2026/raw/miami_map.webp",
        winner: "待更新",
        fastestLap: "1:29.802"
      },
      {
        id: "R05",
        name: "Chinese Grand Prix",
        date: "04.19",
        thumb: "/assets/circuits/2026/raw/shanghai_map.webp",
        winner: "待更新",
        fastestLap: "1:37.521"
      },
      {
        id: "R04",
        name: "Japanese Grand Prix",
        date: "04.05",
        thumb: "/assets/circuits/2026/raw/suzuka_map.webp",
        winner: "待更新",
        fastestLap: "1:33.784"
      }
    ]
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
    this.setData({ seasonIndex: idx })
  },
  onRaceTap(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showToast({
      title: `${name || id} 遥测已就绪`,
      icon: "none"
    })
  },
  onGoCompare() {
    wx.switchTab({ url: "/pages/compare/index" })
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
