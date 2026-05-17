Page({
  data: {
    raceName: "",
    sessionName: "",
    sessionKey: 0,
    items: []
  },
  onLoad(options) {
    const raceName = decodeURIComponent(options.raceName || "")
    const sessionName = decodeURIComponent(options.sessionName || "")
    const sessionKey = Number(options.sessionKey || 0)
    this.setData({ raceName, sessionName, sessionKey }, () => {
      if (sessionName) {
        wx.setNavigationBarTitle({ title: sessionName })
      }
      this.loadResults()
    })
  },
  onPullDownRefresh() {
    this.loadResults({ isPullDown: true })
  },
  loadResults(opts) {
    const done = () => {
      if (opts && opts.isPullDown) {
        wx.stopPullDownRefresh()
      }
    }
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    if (!apiBase || !this.data.sessionKey) {
      done()
      return
    }
    const url = `${apiBase.replace(/\/+$/, "")}/api/v1/mp/session-results?session_key=${this.data.sessionKey}`
    wx.request({
      url,
      method: "GET",
      success: (res) => {
        const data = (res && res.data) || {}
        const items = Array.isArray(data.items) ? data.items : []
        const mapped = items.map((it) => {
          const c = (it && it.team_color) || ""
          const cardStyle = c ? `border-left: 10rpx solid ${c}; padding-left: 16rpx;` : ""
          return Object.assign({}, it, { cardStyle })
        })
        this.setData({ items: mapped })
        done()
      },
      fail: () => {
        done()
      }
    })
  },
  onDriverTap(e) {
    const driverNumber = Number(e.currentTarget.dataset.driverNumber || 0)
    const driverName = e.currentTarget.dataset.driverName || ""
    if (!this.data.sessionKey || !driverNumber) {
      return
    }
    wx.navigateTo({
      url: `/pages/driver/index?sessionKey=${this.data.sessionKey}&driverNumber=${driverNumber}&driverName=${encodeURIComponent(driverName)}&raceName=${encodeURIComponent(this.data.raceName || "")}&sessionName=${encodeURIComponent(this.data.sessionName || "")}`
    })
  }
})
