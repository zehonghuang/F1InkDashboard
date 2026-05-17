Page({
  data: {
    season: 2026,
    round: 0,
    raceName: "",
    sessions: []
  },
  onLoad(options) {
    const season = Number(options.season || 2026)
    const round = Number(options.round || 0)
    const raceName = decodeURIComponent(options.raceName || "")
    this.setData({ season, round, raceName }, () => {
      if (raceName) {
        wx.setNavigationBarTitle({ title: raceName })
      }
      this.loadSessions()
    })
  },
  onPullDownRefresh() {
    this.loadSessions({ isPullDown: true })
  },
  loadSessions(opts) {
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
    const { season, round } = this.data
    const url = `${apiBase.replace(/\/+$/, "")}/api/v1/mp/race-sessions?season=${season}&round=${round}&tz=Asia/Shanghai`
    wx.request({
      url,
      method: "GET",
      success: (res) => {
        const data = (res && res.data) || {}
        const sessions = Array.isArray(data.sessions) ? data.sessions : []
        const mapped = sessions.map((s) => {
          const status = s.status || "upcoming"
          const statusText = status === "done" ? "已结束" : status === "live" ? "进行中" : "未开始"
          return {
            key: s.key,
            name_cn: s.name_cn,
            name_en: s.name_en,
            start_local: s.start_local,
            status,
            statusText,
            disabled: !!s.disabled,
            openf1_session_key: s.openf1_session_key || null
          }
        })
        const raceName = data.race_name || this.data.raceName
        this.setData({ sessions: mapped, raceName }, () => {
          if (raceName) {
            wx.setNavigationBarTitle({ title: raceName })
          }
        })
        done()
      },
      fail: () => {
        done()
      }
    })
  },
  onSessionTap(e) {
    const disabled = !!e.currentTarget.dataset.disabled
    const key = e.currentTarget.dataset.key
    if (disabled) {
      return
    }
    wx.showToast({ title: `${key} 开发中`, icon: "none" })
  }
})

