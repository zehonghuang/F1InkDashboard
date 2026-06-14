const i18n = require("../../services/i18n")

Page({
  data: {
    i18n: i18n.getDict(),
    season: 2026,
    round: 0,
    raceName: "",
    sessions: [],
    subtitleText: "",
    liveSession: null,
    nextSession: null,
    lastSession: null,
    overviewSession: null,
    overviewStatusText: "",
    weekendDone: false,
    completedCount: 0,
    totalCount: 0
  },
  onLoad(options) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    const season = Number(options.season || 2026)
    const round = Number(options.round || 0)
    const raceName = decodeURIComponent(options.raceName || "")
    this.setData({ season, round, raceName }, () => {
      this.applyI18n()
      if (raceName) {
        wx.setNavigationBarTitle({ title: raceName })
      }
      this.loadSessions()
    })
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n()
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
      header: { "Accept-Language": i18n.getLocale() },
      success: (res) => {
        const data = (res && res.data) || {}
        const sessions = Array.isArray(data.sessions) ? data.sessions : []
        const dict = i18n.getDict()
        const isEn = i18n.getLocale() === "en-US"
        const mapped = sessions.map((s, index) => {
          const status = s.status || "upcoming"
          const statusText =
            status === "done" ? dict.raceSessions.statusDone : status === "live" ? dict.raceSessions.statusLive : dict.raceSessions.statusUpcoming
          const namePrimary = isEn ? s.name_en : s.name_cn
          const nameSecondary = isEn ? s.name_cn : s.name_en
          const statusClass = status === "done" ? "is-done" : status === "live" ? "is-live" : "is-upcoming"
          const statusBadge = status === "done" ? "FINAL" : status === "live" ? "LIVE" : "NEXT"
          return {
            key: s.key,
            name_cn: s.name_cn,
            name_en: s.name_en,
            namePrimary,
            nameSecondary,
            start_local: s.start_local,
            status,
            statusText,
            statusClass,
            statusBadge,
            disabled: !!s.disabled,
            openf1_session_key: s.openf1_session_key || null,
            orderLabel: `S${index + 1}`
          }
        })
        const raceName = data.race_name || this.data.raceName
        const liveSession = mapped.find((x) => x.status === "live") || null
        const nextSession = mapped.find((x) => x.status === "upcoming") || null
        const lastSession = mapped.length ? mapped[mapped.length - 1] : null
        const completedCount = mapped.filter((x) => x.status === "done").length
        const totalCount = mapped.length
        const weekendDone = totalCount > 0 && completedCount >= totalCount
        const overviewSession = liveSession || nextSession || lastSession || null
        const overviewStatusText = liveSession
          ? dict.raceSessions.statusLive
          : nextSession
            ? dict.raceSessions.statusUpcoming
            : dict.raceSessions.statusDone
        this.setData(
          {
            sessions: mapped,
            raceName,
            liveSession,
            nextSession,
            lastSession,
            overviewSession,
            overviewStatusText,
            weekendDone,
            completedCount,
            totalCount
          },
          () => {
          if (raceName) {
            wx.setNavigationBarTitle({ title: raceName })
          }
          }
        )
        done()
      },
      fail: () => {
        done()
      }
    })
  },
  onSessionTap(e) {
    const disabled = !!e.currentTarget.dataset.disabled
    if (disabled) {
      return
    }
    const sessionKey = Number(e.currentTarget.dataset.sessionKey || 0)
    const sessionCode = e.currentTarget.dataset.key || ""
    const sessionName = e.currentTarget.dataset.sessionName || ""
    const raceName = e.currentTarget.dataset.raceName || this.data.raceName || ""
    if (!sessionKey) {
      return
    }
    wx.navigateTo({
      url: `/pages/session-results/index?sessionKey=${sessionKey}&sessionCode=${encodeURIComponent(sessionCode)}&sessionName=${encodeURIComponent(
        sessionName
      )}&raceName=${encodeURIComponent(raceName)}`
    })
  },
  applyI18n() {
    const dict = i18n.getDict()
    const subtitleText = i18n.t("raceSessions.subtitle", { season: this.data.season, round: this.data.round })
    const isEn = i18n.getLocale() === "en-US"
    const sessions = (this.data.sessions || []).map((s) => {
      const status = s.status || "upcoming"
      return Object.assign({}, s, {
        namePrimary: isEn ? s.name_en : s.name_cn,
        nameSecondary: isEn ? s.name_cn : s.name_en,
        statusText: status === "done" ? dict.raceSessions.statusDone : status === "live" ? dict.raceSessions.statusLive : dict.raceSessions.statusUpcoming
      })
    })
    const liveSession = sessions.find((x) => x.status === "live") || null
    const nextSession = sessions.find((x) => x.status === "upcoming") || null
    const lastSession = sessions.length ? sessions[sessions.length - 1] : null
    const overviewSession = liveSession || nextSession || lastSession || null
    const overviewStatusText = liveSession
      ? dict.raceSessions.statusLive
      : nextSession
        ? dict.raceSessions.statusUpcoming
        : dict.raceSessions.statusDone
    this.setData({ i18n: dict, subtitleText, sessions, liveSession, nextSession, lastSession, overviewSession, overviewStatusText })
    const rn = String(this.data.raceName || "").trim()
    if (rn) wx.setNavigationBarTitle({ title: rn })
  }
})
