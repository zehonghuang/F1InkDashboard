const { fetchStandings } = require("../../services/standingsService")
const i18n = require("../../services/i18n")

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
    i18n: i18n.getDict(),
    season: 2026,
    tabs: [],
    activeTabKey: "drivers",
    drivers: [],
    constructors: [],
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
      this.setData({ drivers, constructors, updatedText })
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

