const { fetchStandings } = require("../../services/standingsService")

function formatPoints(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "-"
  const i = Math.round(n)
  if (Math.abs(n - i) < 1e-9) return String(i)
  return String(Math.round(n * 10) / 10)
}

function withCardStyle(items) {
  return (items || []).map((it) => {
    const c = (it && it.team_color) || ""
    const cardStyle = c ? `border-left: 10rpx solid ${c}; padding-left: 16rpx;` : ""
    return Object.assign({}, it, { cardStyle, points: formatPoints(it && it.points) })
  })
}

Page({
  data: {
    season: 2026,
    tabs: [
      { key: "drivers", label: "车手" },
      { key: "constructors", label: "车队" }
    ],
    activeTabKey: "drivers",
    drivers: [],
    constructors: [],
    loading: false,
    errorText: "",
    updatedText: ""
  },
  onLoad(options) {
    const season = Number((options && options.season) || 0) || 2026
    this.setData({ season }, () => this.refresh())
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
      const updatedText = r.generatedAtUTC ? `数据更新时间(UTC)：${String(r.generatedAtUTC).replace("T", " ").replace("Z", "")}` : ""
      this.setData({ drivers, constructors, updatedText })
      if (!drivers.length && !constructors.length) {
        this.setData({ errorText: "暂无可用赛季排名数据" })
      }
    } catch (e) {
      this.setData({ errorText: "排名加载失败" })
    } finally {
      this.setData({ loading: false })
    }
  }
})

