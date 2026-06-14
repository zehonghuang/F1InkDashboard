const { LAYOUT_CODE } = require("../../services/newsService")
const { fetchNewsList } = require("../../services/mpNewsApi")
const { fetchRaceWeek } = require("../../services/mpRaceWeekApi")
const { fetchRaceSessions } = require("../../services/mpRaceSessionsApi")
const { fetchLatestCrawledSessionResults } = require("../../services/mpSessionResultsApi")
const { createMotorsportLiveClient } = require("../../services/motorsportLiveWs")
const i18n = require("../../services/i18n")

const WELCOME_KEY = "news_welcome_shown_v1"
const PREF_TEAMS_KEY = "pref_follow_teams"
const PREF_DRIVERS_KEY = "pref_follow_drivers"
const PREF_TEAMS_DICT_KEY = "pref_follow_teams_dict"
const PREF_DRIVERS_DICT_KEY = "pref_follow_drivers_dict"
const PREFS_INITED_KEY = "pref_prefs_inited"

function normalizeText(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
}

function getLocalPrefs() {
  let followTeams = []
  let followDrivers = []
  let followTeamsDict = {}
  let followDriversDict = {}

  try {
    const app = getApp()
    const gp = app && app.globalData && app.globalData.prefs
    if (gp) {
      followTeams = Array.isArray(gp.followTeams) ? gp.followTeams : []
      followDrivers = Array.isArray(gp.followDrivers) ? gp.followDrivers : []
      followTeamsDict = gp.followTeamsDict && typeof gp.followTeamsDict === "object" ? gp.followTeamsDict : {}
      followDriversDict = gp.followDriversDict && typeof gp.followDriversDict === "object" ? gp.followDriversDict : {}
    }
  } catch (e) {}

  if (!followTeams.length) {
    try {
      const xs = wx.getStorageSync(PREF_TEAMS_KEY)
      if (Array.isArray(xs)) {
        followTeams = xs.map((x) => String(x || "").trim()).filter(Boolean)
      }
    } catch (e) {}
  }

  if (!followDrivers.length) {
    try {
      const xs = wx.getStorageSync(PREF_DRIVERS_KEY)
      if (Array.isArray(xs)) {
        followDrivers = xs.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      }
    } catch (e) {}
  }

  if (!Object.keys(followTeamsDict).length) {
    try {
      const m = wx.getStorageSync(PREF_TEAMS_DICT_KEY)
      if (m && typeof m === "object") followTeamsDict = m
    } catch (e) {}
  }

  if (!Object.keys(followDriversDict).length) {
    try {
      const m = wx.getStorageSync(PREF_DRIVERS_DICT_KEY)
      if (m && typeof m === "object") followDriversDict = m
    } catch (e) {}
  }

  return { followTeams, followDrivers, followTeamsDict, followDriversDict }
}

function getPrefHitInfo(item, prefs) {
  const teams = Array.isArray(prefs && prefs.followTeams) ? prefs.followTeams : []
  const drivers = Array.isArray(prefs && prefs.followDrivers) ? prefs.followDrivers : []
  if (!teams.length && !drivers.length) return { hit: false, teamKey: "", driverNumber: 0 }

  const tags = Array.isArray(item && item.tags) ? item.tags.map((x) => normalizeText(x)) : []
  const hay = normalizeText(`${(item && item.tagText) || ""} ${(item && item.title) || ""} ${(item && item.summary) || ""}`)

  for (const t of teams) {
    const key = normalizeText(t)
    if (!key) continue
    if (tags.includes(key) || hay.includes(key)) return { hit: true, teamKey: String(t).trim(), driverNumber: 0 }
  }

  for (const n of drivers) {
    const key = normalizeText(String(n))
    if (!key) continue
    if (tags.includes(key) || hay.includes(key)) return { hit: true, teamKey: "", driverNumber: Number(n) || 0 }
  }

  return { hit: false, teamKey: "", driverNumber: 0 }
}

function resolvePrefHitColor(info, prefs) {
  const teams = prefs && prefs.followTeamsDict && typeof prefs.followTeamsDict === "object" ? prefs.followTeamsDict : {}
  const drivers = prefs && prefs.followDriversDict && typeof prefs.followDriversDict === "object" ? prefs.followDriversDict : {}
  if (info && info.teamKey) {
    const it = teams[info.teamKey]
    const c = it && typeof it.color === "string" ? it.color : ""
    if (c && c.trim()) return c.trim()
  }
  if (info && info.driverNumber) {
    const it = drivers[String(info.driverNumber)]
    const c = it && typeof it.color === "string" ? it.color : ""
    if (c && c.trim()) return c.trim()
  }
  return "#2EE8D8"
}

function promoteNewHitItems({ prevList, nextList, prefs }) {
  const prev = Array.isArray(prevList) ? prevList : []
  const next = Array.isArray(nextList) ? nextList : []
  if (!prev.length) return { list: next, promotedIds: [] }

  const prevIds = new Set(prev.map((x) => (x && x.id ? x.id : "")).filter(Boolean))
  const nextById = new Map()
  for (const it of next) {
    if (it && it.id) nextById.set(it.id, it)
  }

  const newItems = []
  for (const it of next) {
    if (!it || !it.id || prevIds.has(it.id)) continue
    newItems.push(it)
  }

  const promoted = []
  const otherNew = []
  for (const it of newItems) {
    if (getPrefHitInfo(it, prefs).hit) promoted.push(it)
    else otherNew.push(it)
  }

  const promotedIds = promoted.map((x) => x.id)
  const existingInPrevOrder = []
  for (const it of prev) {
    if (!it || !it.id) continue
    const updated = nextById.get(it.id)
    if (updated) existingInPrevOrder.push(updated)
  }

  return { list: [...promoted, ...otherNew, ...existingInPrevOrder], promotedIds }
}

function buildPrefPromotePlan({ prevList, nextList, prefs }) {
  const prev = Array.isArray(prevList) ? prevList : []
  const next = Array.isArray(nextList) ? nextList : []
  if (!prev.length) {
    return { moveId: "", initialList: next, finalList: next, promotedIds: [] }
  }

  const prevIds = new Set(prev.map((x) => (x && x.id ? x.id : "")).filter(Boolean))
  const nextById = new Map()
  for (const it of next) {
    if (it && it.id) nextById.set(it.id, it)
  }

  const newItems = []
  for (const it of next) {
    if (!it || !it.id || prevIds.has(it.id)) continue
    newItems.push(it)
  }

  const promoted = []
  for (const it of newItems) {
    if (getPrefHitInfo(it, prefs).hit) promoted.push(it)
  }

  const promotedIds = promoted.map((x) => x.id)
  const moveId = promotedIds.length ? promotedIds[0] : ""

  const restWithoutPromoted = next.filter((x) => x && x.id && !promotedIds.includes(x.id))

  const finalList = [...promoted, ...restWithoutPromoted].map((x) => {
    if (!x || !x.id) return x
    const info = getPrefHitInfo(x, prefs)
    const hit = Boolean(info && info.hit)
    const withHit = hit ? { ...x, _prefHit: true, _prefHitColor: resolvePrefHitColor(info, prefs) } : { ...x, _prefHit: false, _prefHitColor: "" }
    if (!promotedIds.includes(x.id)) return withHit
    return { ...withHit, _prefPromoted: true }
  })

  if (!moveId) {
    return { moveId: "", initialList: finalList, finalList, promotedIds }
  }

  const initialList = restWithoutPromoted.map((x) => {
    if (!x || !x.id) return x
    const info = getPrefHitInfo(x, prefs)
    if (!info || !info.hit) return { ...x, _prefHit: false, _prefHitColor: "" }
    return { ...x, _prefHit: true, _prefHitColor: resolvePrefHitColor(info, prefs) }
  })

  return { moveId, initialList, finalList, promotedIds }
}

function shouldEnablePrefPromoteDemo() {
  try {
    const app = getApp()
    const ds = app && app.globalData && app.globalData.newsDataSource
    if (ds === "mock") return true
    return String(wx.getStorageSync("news_demo_pref_promote") || "") === "1"
  } catch (e) {
    return false
  }
}

function buildDemoNewsItems(prefs) {
  const teams = Array.isArray(prefs && prefs.followTeams) ? prefs.followTeams : []
  const drivers = Array.isArray(prefs && prefs.followDrivers) ? prefs.followDrivers : []
  if (!teams.length && !drivers.length) return []
  const team = String(teams[0] || "Mercedes").trim() || "Mercedes"
  const dn = Number(drivers[0] || 63) || 63
  const now = new Date()
  const iso = now.toISOString()
  const hitId = `demo_pref_hit_${team.replace(/\s+/g, "_").toLowerCase()}_${String(dn)}`
  return [
    {
      id: hitId,
      layoutCode: LAYOUT_CODE.STANDARD,
      heroDisplayCode: "",
      typeCode: "PADDOCK",
      pinned: false,
      weight: 0,
      tagText: `${team} / Demo`,
      tags: [team, String(dn)],
      title: `【Demo】${team} 动态：与 ${dn} 号车手相关的新消息`,
      summary: `用于演示“命中偏好即置顶”。关注车队/车手命中后，这条会在下拉刷新时被挪到表头并滑入。`,
      coverUrl: "",
      publishedAt: iso,
      timeText: "刚刚",
      source: { name: "Mock", url: "" },
      content: { formatCode: "PLAIN", text: "仅用于前端演示。" },
      _demo: true
    },
    {
      id: `demo_pref_miss_${Date.now()}`,
      layoutCode: LAYOUT_CODE.STANDARD,
      heroDisplayCode: "",
      typeCode: "PADDOCK",
      pinned: false,
      weight: 0,
      tagText: "Demo",
      tags: ["demo"],
      title: "【Demo】不命中偏好的新资讯",
      summary: "用于演示对比：这条不会被置顶，只会按新增插入在置顶组之后。",
      coverUrl: "",
      publishedAt: iso,
      timeText: "刚刚",
      source: { name: "Mock", url: "" },
      content: { formatCode: "PLAIN", text: "仅用于前端演示。" },
      _demo: true
    }
  ]
}

function mapCrawledRowsToLiveStandings(rows) {
  const list = Array.isArray(rows) ? rows : []
  return list.map((row, index) => ({
    position: Number(row && row.pos) || index + 1,
    driver: (row && row.driver) || "",
    team: (row && row.team) || "",
    gap: (row && row.gap) || "",
    time: (row && row.time) || "",
    tyre: (row && row.tyre) || "",
    laps: Number(row && row.laps) || 0,
    pitCount: Number(row && row.pitCount) || 0,
    teamColor: (row && row.teamColor) || ""
  }))
}

function mapMotorsportStandingsRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  return list.map((row, index) => ({
    position: Number(row && row.position) || index + 1,
    driver: (row && row.driver) || "",
    team: (row && row.team) || "",
    gap: (row && row.gap) || "",
    time: (row && row.time) || "",
    tyre: (row && row.tyre) || "",
    laps: Number(row && row.laps) || 0,
    pitCount: Number(row && row.pit_count) || Number(row && row.pitCount) || 0,
    teamColor: (row && row.team_color) || (row && row.teamColor) || ""
  }))
}

function getLiveStandingsFullBodyHeightRpx(rows) {
  const count = Array.isArray(rows) ? rows.length : 0
  if (count <= 0) return 360
  const headRpx = 52
  const rowRpx = 72
  const bottomRpx = 20
  return headRpx + count * rowRpx + bottomRpx
}

function getSessionLiveDurationSec(key) {
  const code = String(key || "").trim().toUpperCase()
  if (code === "RACE") return 4 * 3600
  return 90 * 60
}

function buildRaceWeekTimelineSessions(sessions) {
  const list = Array.isArray(sessions) ? sessions : []
  return list
    .map((session) => {
      const startMs = Date.parse(session && session.startUTC)
      if (!Number.isFinite(startMs) || startMs <= 0) return null
      const durationSec = getSessionLiveDurationSec(session && session.key)
      return {
        key: session.key || "",
        startUTC: session.startUTC || "",
        startLocal: session.startLocal || "",
        openF1SessionKey: Number(session && session.openF1SessionKey) || 0,
        startMs,
        endMs: startMs + durationSec * 1000,
        durationSec
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs)
}

function resolveRaceWeekTimelineState(sessions, nowMs) {
  const list = Array.isArray(sessions) ? sessions : []
  const now = Number(nowMs) || Date.now()
  for (const session of list) {
    if (now < session.startMs) {
      return {
        mode: "countdown",
        session,
        remainSec: Math.max(0, Math.floor((session.startMs - now) / 1000))
      }
    }
    if (now < session.endMs) {
      return {
        mode: "live",
        session,
        remainSec: Math.max(0, Math.floor((session.endMs - now) / 1000))
      }
    }
  }
  return null
}

Page({
  data: {
    i18n: i18n.getDict(),
    apiBase: "",
    banners: [],
    list: [],
    raceWeek: null,
    raceWeekSessionLabel: "",
    raceWeekSessionLabelCompact: false,
    raceWeekCardMode: "",
    raceWeekLiveStandingsOpen: false,
    raceWeekShowFlag: false,
    countdown: null,
    liveStandingsRows: [],
    qualiOpen: false,
    qualiVisible: false,
    qualiTitle: "",
    qualiRows: [],
    welcome: null,
    showWelcome: false,
    loading: false,
    loadingMore: false,
    errorText: "",
    page: 1,
    pageSize: 20,
    hasMore: true,
    statusBarHeight: 0,
    liveStandingsStickyTopPx: 0,
    liveStandingsBodyHeightRpx: 360,
    prefMoveOverlay: null,
    listTransformStyle: "",
    refreshing: false,
    pressPreview: null,
    pressJiggleId: ""
  },
  pad2(v) {
    const n = Math.max(0, Math.floor(Number(v) || 0))
    return String(n).padStart(2, "0")
  },
  computeCountdown(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0))
    const hh = Math.floor(s / 3600)
    if (s > 86400) {
      const dd = Math.floor(s / 86400)
      const rem = s - dd * 86400
      const hh2 = Math.floor(rem / 3600)
      const mm2 = Math.floor((rem - hh2 * 3600) / 60)
      return { mode: "dhm", a1: this.pad2(dd), a2: this.pad2(hh2), a3: this.pad2(mm2) }
    }
    const mm = Math.floor((s - hh * 3600) / 60)
    const ss = s - hh * 3600 - mm * 60
    return { mode: "hms", a1: this.pad2(hh), a2: this.pad2(mm), a3: this.pad2(ss) }
  },
  getSessionLabel(key, dict) {
    const k = String(key || "")
      .trim()
      .toUpperCase()
    const d = dict && dict.news ? dict.news : i18n.getDict().news
    if (k === "FP1") return d.sessionFP1 || k
    if (k === "FP2") return d.sessionFP2 || k
    if (k === "FP3") return d.sessionFP3 || k
    if (k === "SQ") return d.sessionSQ || k
    if (k === "SPRINT") return d.sessionSprint || k
    if (k === "Q") return d.sessionQ || k
    if (k === "RACE") return d.sessionRace || k
    return k
  },
  shouldShowRaceWeekFlag(seconds, race) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0))
    return Boolean(race && race.flagUrl && s > 24 * 3600)
  },
  buildRaceWeekSessionLabelState(label) {
    const s = String(label || "").trim()
    const hasCjk = /[\u4e00-\u9fff]/.test(s)
    const hasSpace = /\s/.test(s)
    const compact = Boolean(s && hasCjk && !hasSpace && s.length > 3)
    return { raceWeekSessionLabel: s, raceWeekSessionLabelCompact: compact }
  },
  stopRaceWeekTimer() {
    clearInterval(this._raceWeekTimer)
    this._raceWeekTimer = null
  },
  updateRaceWeekDisplay() {
    const raceWeek = this.data.raceWeek
    const state = resolveRaceWeekTimelineState(this._raceWeekTimelineSessions, Date.now())
    if (!raceWeek || !raceWeek.isRaceWeek || !state || !state.session) {
      this.setData({
        ...this.buildRaceWeekSessionLabelState(""),
        raceWeekCardMode: "",
        raceWeekLiveStandingsOpen: false,
        raceWeekShowFlag: false,
        countdown: null
      })
      return
    }
    const dict = i18n.getDict()
    const label = this.getSessionLabel(state.session.key, dict)
    this.setData({
      ...this.buildRaceWeekSessionLabelState(label),
      raceWeekCardMode: state.mode,
      raceWeekLiveStandingsOpen: state.mode === "live" ? this.data.raceWeekLiveStandingsOpen : false,
      raceWeekShowFlag: state.mode === "countdown" && this.shouldShowRaceWeekFlag(state.remainSec, raceWeek && raceWeek.race),
      countdown: state.mode === "countdown" ? this.computeCountdown(state.remainSec) : null
    })
  },
  onTapRaceWeekCard() {
    if (this.data.raceWeekCardMode !== "live") return
    if (!Array.isArray(this.data.liveStandingsRows) || !this.data.liveStandingsRows.length) return
    this.setData({ raceWeekLiveStandingsOpen: !this.data.raceWeekLiveStandingsOpen })
  },
  startRaceWeekTimer() {
    if (!Array.isArray(this._raceWeekTimelineSessions) || !this._raceWeekTimelineSessions.length) return
    this.stopRaceWeekTimer()
    this.updateRaceWeekDisplay()
    this._raceWeekTimer = setInterval(() => {
      this.updateRaceWeekDisplay()
      const hasActive = resolveRaceWeekTimelineState(this._raceWeekTimelineSessions, Date.now())
      if (!hasActive) {
        this.stopRaceWeekTimer()
      }
    }, 1000)
  },
  async loadRaceWeek() {
    try {
      const tz = "Asia/Shanghai"
      const season = 2026
      const res = await fetchRaceWeek({ season, tz })
      const round = Number(res && res.race && res.race.round) || 0
      if (!res || !res.isRaceWeek || !round) {
        this.stopRaceWeekTimer()
        this._raceWeekTimelineSessions = []
        this.setData({ raceWeek: res || null, ...this.buildRaceWeekSessionLabelState(""), raceWeekCardMode: "", raceWeekShowFlag: false, countdown: null })
        return
      }
      let timelineSessions = []
      try {
        const sessionsRes = await fetchRaceSessions({ season, round, tz })
        timelineSessions = buildRaceWeekTimelineSessions(sessionsRes && sessionsRes.sessions)
      } catch (e) {}
      if (!timelineSessions.length) {
        const ns = res && res.nextSession ? res.nextSession : null
        timelineSessions = buildRaceWeekTimelineSessions(
          ns && ns.startsAtUTC
            ? [
                {
                  key: ns.key || "",
                  startUTC: ns.startsAtUTC,
                  startLocal: ns.startsAtLocal || "",
                  openF1SessionKey: ns.openF1SessionKey || 0
                }
              ]
            : []
        )
      }
      this._raceWeekTimelineSessions = timelineSessions
      this.setData({ raceWeek: res }, () => {
        this.updateRaceWeekDisplay()
        this.startRaceWeekTimer()
      })
    } catch (e) {
      this.stopRaceWeekTimer()
      this._raceWeekTimelineSessions = []
      this.setData({ raceWeek: null, ...this.buildRaceWeekSessionLabelState(""), raceWeekCardMode: "", raceWeekShowFlag: false, countdown: null })
    }
  },
  async loadLatestCrawledResults() {
    try {
      const res = await fetchLatestCrawledSessionResults()
      const shouldDisplay = !res || res.shouldDisplay !== false
      const crawledRows = shouldDisplay && Array.isArray(res && res.rows) ? res.rows : []
      const nextData = {
        qualiTitle: shouldDisplay ? (res && res.title) || "" : "",
        qualiRows: crawledRows
      }
      if (!this._motorsportLiveHasSnapshot) {
        const liveStandingsRows = mapCrawledRowsToLiveStandings(crawledRows)
        nextData.liveStandingsRows = liveStandingsRows
        nextData.liveStandingsBodyHeightRpx = getLiveStandingsFullBodyHeightRpx(liveStandingsRows)
      }
      this.setData(nextData)
    } catch (e) {
      const nextData = {
        qualiTitle: "",
        qualiRows: []
      }
      if (!this._motorsportLiveHasSnapshot) {
        nextData.liveStandingsRows = []
        nextData.liveStandingsBodyHeightRpx = getLiveStandingsFullBodyHeightRpx([])
      }
      this.setData(nextData)
    }
  },
  applyMotorsportLiveStandings(standings) {
    const rows = mapMotorsportStandingsRows(standings && standings.rows)
    if (!rows.length) return
    this._motorsportLiveHasSnapshot = true
    this.setData({
      liveStandingsRows: rows,
      liveStandingsBodyHeightRpx: getLiveStandingsFullBodyHeightRpx(rows)
    })
  },
  ensureMotorsportLiveClient() {
    if (this._motorsportLiveClient) return
    this._motorsportLiveClient = createMotorsportLiveClient({
      reconnectDelayMs: 3000,
      onStatus: (status) => {
        this._motorsportLiveStatus = status || null
      },
      onStandings: (standings) => {
        this.applyMotorsportLiveStandings(standings)
      },
      onError: (error) => {
        this._motorsportLiveLastError = error || null
      },
      onClose: () => {}
    })
  },
  connectMotorsportLiveWs() {
    this.ensureMotorsportLiveClient()
    if (this._motorsportLiveClient) {
      this._motorsportLiveClient.connect()
    }
  },
  disconnectMotorsportLiveWs() {
    if (this._motorsportLiveClient) {
      this._motorsportLiveClient.disconnect()
    }
  },
  onToggleQualiPanel() {
    if (!this.data.qualiOpen) {
      this.setData({ qualiVisible: true }, () => {
        wx.nextTick(() => {
          this.setData({ qualiOpen: true })
        })
      })
      return
    }
    this.setData({ qualiOpen: false })
    clearTimeout(this._qualiHideTimer)
    this._qualiHideTimer = setTimeout(() => {
      this.setData({ qualiVisible: false })
    }, 260)
  },
  onLoad() {
    this._motorsportLiveHasSnapshot = false
    this._raceWeekTimelineSessions = []
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    try {
      const app = getApp()
      if (app && app.globalData && app.globalData.tweakAEffective) {
        wx.switchTab({ url: "/pages/archive/index" })
        return
      }
      const apiBase = app && app.globalData && app.globalData.apiBase ? String(app.globalData.apiBase) : ""
      this.setData({ apiBase })
    } catch (e) {}
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      const ww = Number(sys && sys.windowWidth) || 0
      this._pxPerRpx = ww > 0 ? ww / 750 : 0
      const stickyTopPx = h + Math.round((this._pxPerRpx || 0) * 12)
      this.setData({
        statusBarHeight: h,
        liveStandingsStickyTopPx: stickyTopPx
      })
    } catch (e) {}
    this.applyI18n()
    this.setListOffset(0, 0)
    this._useScrollViewRefresher = true
    this.ensureMotorsportLiveClient()
    this.reload()
  },
  onHide() {
    this.disconnectMotorsportLiveWs()
  },
  onUnload() {
    this.disconnectMotorsportLiveWs()
    if (this._offLocale) this._offLocale()
    this.stopRaceWeekTimer()
    clearTimeout(this._prefPromotedTimer)
    clearTimeout(this._prefMoveTimer)
    clearTimeout(this._prefMoveTimer2)
    clearTimeout(this._waitTopTimer)
    clearTimeout(this._suppressTapTimer)
    clearTimeout(this._pressPreviewHideTimer)
    clearTimeout(this._qualiHideTimer)
  },
  onShow() {
    this.applyI18n()
    this.connectMotorsportLiveWs()
    if (typeof this.getTabBar === "function") {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === "function") {
        tb.setSelectedByRoute(this.route)
      }
      if (tb && typeof tb.setVisible === "function") {
        tb.setVisible(!this.data.showWelcome && !(this.data.pressPreview && this.data.pressPreview.show))
      }
    }
  },
  onReady() {
    this.initWorklet()
  },
  onPullDownRefresh() {
    if (this._useScrollViewRefresher) return
    this.reload({ stopRefresh: true, reset: true, softReset: true })
  },
  onRefresherRefresh() {
    if (this.data.loading || this.data.loadingMore) {
      this.setData({ refreshing: false })
      return
    }
    this.setData({ refreshing: true }, () => {
      this.reload({ stopRefresh: true, reset: true, softReset: true })
    })
  },
  onPageScroll(e) {
    const top = e && e.detail && typeof e.detail.scrollTop === "number" ? e.detail.scrollTop : 0
    this._scrollTop = top
  },
  onScrollToLower() {
    this.onReachBottom()
  },
  reload(opts) {
    if (this.data.loading || this.data.loadingMore) return
    const reset = !opts || opts.reset !== false
    const softReset = Boolean(opts && opts.softReset)
    const nextPage = reset ? 1 : Number((opts && opts.page) || this.data.page || 1)
    if (reset) {
      this.loadRaceWeek()
      this.loadLatestCrawledResults()
    }
    if (reset) {
      if (softReset) {
        this.setData({ loading: true, errorText: "", page: 1, hasMore: true })
      } else {
        this.setData({ loading: true, errorText: "", page: 1, hasMore: true, banners: [], list: [], welcome: null, showWelcome: false })
      }
    } else {
      this._loadingMoreStartAt = Date.now()
      this.setData({ loadingMore: true, errorText: "" })
    }
    const done = () => {
      if (opts && opts.stopRefresh) {
        if (this._useScrollViewRefresher) {
          this.setData({ refreshing: false })
        } else {
          wx.stopPullDownRefresh()
        }
      }
      if (reset) {
        this.setData({ loading: false })
        return
      }
      const startAt = Number(this._loadingMoreStartAt || 0)
      const elapsed = startAt ? Date.now() - startAt : 9999
      const minHold = 420
      if (elapsed >= minHold) {
        this.setData({ loadingMore: false })
        return
      }
      clearTimeout(this._loadingMoreHoldTimer)
      this._loadingMoreHoldTimer = setTimeout(() => {
        this.setData({ loadingMore: false })
      }, minHold - elapsed)
    }

    fetchNewsList({ page: nextPage, pageSize: this.data.pageSize, tz: "Asia/Shanghai" })
      .then((res) => {
        const items = (res && res.items) || []
        if (reset) {
          const prevList = softReset ? this.data.list || [] : []
          const breaking = items.find((x) => x && x.layoutCode === LAYOUT_CODE.BREAKING) || null
          const heroBanners = items.filter((x) => x && x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER")
          const banners = breaking ? [breaking, ...heroBanners] : heroBanners
          const rest = items.filter((x) => {
            if (!x) return false
            if (breaking && x.id === breaking.id) return false
            if (x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER") return false
            return true
          })

          let nextList = rest
          let promotedIds = []
          let pendingMoveId = ""
          let pendingFinalList = null
          if (softReset && Array.isArray(prevList) && prevList.length) {
            const prefs = getLocalPrefs()
            let restWithDemo = rest
            if (shouldEnablePrefPromoteDemo()) {
              const demo = buildDemoNewsItems(prefs)
              const seen = new Set(rest.map((x) => (x && x.id ? x.id : "")).filter(Boolean))
              const inject = demo.filter((x) => x && x.id && !seen.has(x.id))
              restWithDemo = inject.length ? [...rest, ...inject] : rest
            }
            const plan = buildPrefPromotePlan({ prevList, nextList: restWithDemo, prefs })
            promotedIds = plan.promotedIds
            pendingMoveId = plan.moveId
            pendingFinalList = plan.moveId ? plan.finalList : null
            nextList = plan.initialList
          } else {
            const prefs = getLocalPrefs()
            nextList = (nextList || []).map((x) => {
              if (!x || !x.id) return x
              const info = getPrefHitInfo(x, prefs)
              if (!info || !info.hit) return { ...x, _prefHit: false, _prefHitColor: "" }
              return { ...x, _prefHit: true, _prefHitColor: resolvePrefHitColor(info, prefs) }
            })
          }

          let showWelcome = false
          if (breaking) {
            const shown = Boolean(wx.getStorageSync(WELCOME_KEY))
            showWelcome = !shown
            if (showWelcome) {
              wx.setStorageSync(WELCOME_KEY, "1")
            }
          }

          const hasMore = (Number(res.page || 1) * Number(res.pageSize || this.data.pageSize || 20)) < Number(res.total || 0)
          this.setData({ banners, list: nextList, welcome: breaking, showWelcome, page: Number(res.page || 1), hasMore }, () => {
            if (typeof this.getTabBar === "function") {
              const tb = this.getTabBar()
              if (tb && typeof tb.setVisible === "function") {
                tb.setVisible(!showWelcome)
              }
            }
            done()
            if (pendingMoveId && pendingFinalList) {
              this.waitForReboundToTop(() => {
                this.startPrefMoveToTop({ id: pendingMoveId, finalList: pendingFinalList })
              })
            } else if (promotedIds && promotedIds.length) {
              clearTimeout(this._prefPromotedTimer)
              this._prefPromotedTimer = setTimeout(() => {
                const list = (this.data.list || []).map((x) => {
                  if (!x || !x.id) return x
                  if (!x._prefPromoted) return x
                  return { ...x, _prefPromoted: false }
                })
                this.setData({ list })
              }, 650)
            }
          })
          return
        }

        const bannerIds = new Set()
        for (const b of this.data.banners || []) {
          if (b && b.id) bannerIds.add(b.id)
        }
        const next = items.filter((x) => {
          if (!x || !x.id) return false
          if (bannerIds.has(x.id)) return false
          if (x.layoutCode === LAYOUT_CODE.BREAKING) return false
          if (x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER") return false
          return true
        })
        const seen = new Set((this.data.list || []).map((x) => (x && x.id ? x.id : "")))
        const merged = [...(this.data.list || [])]
        for (const it of next) {
          if (!it || !it.id || seen.has(it.id)) continue
          seen.add(it.id)
          merged.push(it)
        }
        const prefs = getLocalPrefs()
        const decorated = merged.map((x) => {
          if (!x || !x.id) return x
          const info = getPrefHitInfo(x, prefs)
          if (!info || !info.hit) return { ...x, _prefHit: false, _prefHitColor: "" }
          return { ...x, _prefHit: true, _prefHitColor: resolvePrefHitColor(info, prefs) }
        })
        const hasMore = (Number(res.page || 1) * Number(res.pageSize || this.data.pageSize || 20)) < Number(res.total || 0)
        this.setData({ list: decorated, page: Number(res.page || 1), hasMore }, done)
      })
      .catch(() => {
        this.setData({ errorText: i18n.t("news.loadFailedRetry") }, () => done())
      })
  },
  setListOffset(y, duration, timingFunction) {
    if (this._workletEnabled) return
    const yy = Math.round(Number(y) || 0)
    const d = Math.max(0, Math.round(Number(duration) || 0))
    const tf = timingFunction || "ease-out"
    const t = d > 0 ? `transition:transform ${d}ms ${tf};` : "transition:none;"
    const s = `transform:translate3d(0,${yy}px,0);${t}`
    this.setData({ listTransformStyle: s })
  },
  initWorklet() {
    try {
      if (!wx.worklet) return
      if (typeof this.applyAnimatedStyle !== "function") return
      const { shared } = wx.worklet
      if (typeof shared !== "function") return

      const listY = shared(0)
      const overlayY = shared(0)
      const overlayOpacity = shared(0)
      this._workletState = { listY, overlayY, overlayOpacity }

      this._workletEnabled = true
      this.setData({ listTransformStyle: "" })
    } catch (e) {
      this._workletEnabled = false
    }
  },
  waitForReboundToTop(cb) {
    clearTimeout(this._waitTopTimer)
    const startAt = Date.now()
    let stable = 0
    const tick = () => {
      if (this._useScrollViewRefresher) {
        const top = Number(this._scrollTop || 0)
        if (top <= 1) stable += 1
        else stable = 0
        if (stable >= 3) {
          cb && cb()
          return
        }
        if (Date.now() - startAt > 900) {
          cb && cb()
          return
        }
        this._waitTopTimer = setTimeout(tick, 50)
        return
      }
      try {
        const query = wx.createSelectorQuery().in(this)
        query.selectViewport().scrollOffset()
        query.exec((rs) => {
          const off = rs && rs[0]
          const top = off && typeof off.scrollTop === "number" ? off.scrollTop : 0
          if (top <= 1) stable += 1
          else stable = 0
          if (stable >= 3) {
            cb && cb()
            return
          }
          if (Date.now() - startAt > 900) {
            cb && cb()
            return
          }
          this._waitTopTimer = setTimeout(tick, 50)
        })
      } catch (e) {
        cb && cb()
      }
    }
    tick()
  },
  startPrefMoveToTop({ id, finalList }) {
    if (this._workletEnabled) {
      this.startPrefMoveToTopWorklet({ id, finalList })
      return
    }
    this.startPrefMoveToTopLegacy({ id, finalList })
  },
  startPrefMoveToTopWorklet({ id, finalList }) {
    clearTimeout(this._prefMoveTimer)
    clearTimeout(this._prefMoveTimer2)
    const targetId = String(id || "").trim()
    if (!targetId) return
    const item = (finalList || []).find((x) => x && x.id === targetId) || null
    if (!item) return

    const q = wx.createSelectorQuery().in(this)
    q.select("#news-list").boundingClientRect()
    q.select("#news-list .news-card").boundingClientRect()
    q.exec((rects) => {
      const listRect = rects && rects[0]
      const cardRect = rects && rects[1]
      if (!listRect) {
        this.setData({ list: finalList || [], prefMoveOverlay: null })
        return
      }

      const left = Math.round((cardRect && cardRect.left) || (listRect && listRect.left) || 0)
      const width = Math.round((cardRect && cardRect.width) || (listRect && listRect.width) || 0)
      const height = Number((cardRect && cardRect.height) || 0)
      const gapPx = Math.round((Number(this._pxPerRpx) || 0) * 16)
      const pull = Math.max(0, Math.min(220, Math.round(height + gapPx)))
      const gap = Math.max(12, gapPx)
      const destTop = Math.round((listRect && listRect.top) || 0)

      const style = `left:${left}px;top:${destTop}px;width:${width}px;`
      this.setData({ prefMoveOverlay: { show: true, item, style } }, () => {
        const st = this._workletState
        if (!st || !wx.worklet || !wx.worklet.runOnUI) {
          this.setData({ list: finalList || [], prefMoveOverlay: null })
          return
        }
        if (typeof this.applyAnimatedStyle === "function" && !this._workletStylesApplied) {
          this._workletStylesApplied = true
          wx.nextTick(() => {
            try {
              const listY = st.listY
              this.applyAnimatedStyle("#news-list", () => {
                "worklet"
                return { transform: `translateY(${listY.value}px)` }
              })
            } catch (e) {}
            try {
              const overlayY = st.overlayY
              const overlayOpacity = st.overlayOpacity
              this.applyAnimatedStyle("#pref-move-overlay", () => {
                "worklet"
                return {
                  opacity: overlayOpacity.value,
                  transform: `translateY(${overlayY.value}px)`
                }
              })
            } catch (e) {}
          })
        }

        try {
          const { runOnUI, timing, sequence, delay, Easing } = wx.worklet
          const listY = st.listY
          const overlayY = st.overlayY
          const overlayOpacity = st.overlayOpacity
          runOnUI(() => {
            "worklet"
            const ease = Easing && Easing.ease ? Easing.ease : undefined
            overlayOpacity.value = 1
            overlayY.value = pull + gap
            listY.value = 0
            overlayY.value = timing(0, { duration: 520, easing: ease })
            listY.value = sequence(
              timing(pull, { duration: 220, easing: ease }),
              delay(340, timing(0, { duration: 260, easing: ease }))
            )
          })()
        } catch (e) {}

        clearTimeout(this._prefMoveTimer)
        this._prefMoveTimer = setTimeout(() => {
          const hiddenList = (finalList || []).map((x, idx) => {
            if (!x || !x.id) return x
            if (idx !== 0) return x
            return { ...x, _prefMoveHidden: true }
          })
          this.setData({ list: hiddenList })
        }, 260)

        clearTimeout(this._prefMoveTimer2)
        this._prefMoveTimer2 = setTimeout(() => {
          const unhidden = (finalList || []).map((x) => {
            if (!x || !x.id) return x
            if (!x._prefMoveHidden) return x
            const { _prefMoveHidden, ...rest } = x
            return rest
          })
          this.setData({ list: unhidden, prefMoveOverlay: null }, () => {
            try {
              const { runOnUI } = wx.worklet
              const listY = st.listY
              const overlayY = st.overlayY
              const overlayOpacity = st.overlayOpacity
              runOnUI(() => {
                "worklet"
                overlayOpacity.value = 0
                overlayY.value = 0
                listY.value = 0
              })()
            } catch (e) {}
            if (typeof this.clearAnimatedStyle === "function") {
              try {
                this.clearAnimatedStyle("#news-list")
              } catch (e) {}
              try {
                this.clearAnimatedStyle("#pref-move-overlay")
              } catch (e) {}
              this._workletStylesApplied = false
            }

            clearTimeout(this._prefPromotedTimer)
            this._prefPromotedTimer = setTimeout(() => {
              const cleared = (this.data.list || []).map((x) => {
                if (!x || !x.id) return x
                if (!x._prefPromoted) return x
                return { ...x, _prefPromoted: false }
              })
              this.setData({ list: cleared })
            }, 650)
          })
        }, 820)
      })
    })
  },
  startPrefMoveToTopLegacy({ id, finalList }) {
    clearTimeout(this._prefMoveTimer)
    clearTimeout(this._prefMoveTimer2)
    const targetId = String(id || "").trim()
    if (!targetId) return
    const item = (finalList || []).find((x) => x && x.id === targetId) || null
    if (!item) return

    const q = wx.createSelectorQuery().in(this)
    q.select(".news-list").boundingClientRect()
    q.select(".news-list .news-card").boundingClientRect()
    q.exec((rects) => {
      const listRect = rects && rects[0]
      const cardRect = rects && rects[1]
      if (!listRect || !cardRect) {
        this.setData({ list: finalList, prefMoveOverlay: null })
        return
      }

      const left = Number(cardRect.left) || 0
      const width = Number(cardRect.width) || 0
      const height = Number(cardRect.height) || 0
      const gapPx = Math.round((Number(this._pxPerRpx) || 0) * 16)
      const pull = Math.max(0, Math.min(220, Math.round(height + gapPx)))
      const destTop = Number(listRect.top) || Number(cardRect.top) || 0
      const gap = Math.max(12, gapPx)
      const startTop = destTop + pull + gap
      const deltaY = -(pull + gap)

      const initialStyle = `left:${left}px;top:${startTop}px;width:${width}px;transform:translate3d(0,0,0);transition:none;`
      this.setData({ prefMoveOverlay: { show: true, item, style: initialStyle } }, () => {
        wx.nextTick(() => {
          this.setListOffset(pull, 220, "ease-out")
          const movingStyle = `left:${left}px;top:${startTop}px;width:${width}px;transform:translate3d(0,${deltaY}px,0);transition:transform 520ms cubic-bezier(0.22, 1, 0.36, 1);`
          this.setData({ prefMoveOverlay: { show: true, item, style: movingStyle } })
        })

        this._prefMoveTimer = setTimeout(() => {
          const hiddenList = (finalList || []).map((x, idx) => {
            if (!x || !x.id) return x
            if (idx !== 0) return x
            return { ...x, _prefMoveHidden: true }
          })
          this.setData({ list: hiddenList })
          this._prefMoveTimer2 = setTimeout(() => {
            this.setListOffset(0, 260, "ease-out")
          }, 30)
        }, 260)

        this._prefMoveTimer2 = setTimeout(() => {
          const unhidden = (this.data.list || []).map((x) => {
            if (!x || !x.id) return x
            if (!x._prefMoveHidden) return x
            const { _prefMoveHidden, ...rest } = x
            return rest
          })
          this.setData({ list: unhidden, prefMoveOverlay: null }, () => {
            clearTimeout(this._prefPromotedTimer)
            this._prefPromotedTimer = setTimeout(() => {
              const cleared = (this.data.list || []).map((x) => {
                if (!x || !x.id) return x
                if (!x._prefPromoted) return x
                return { ...x, _prefPromoted: false }
              })
              this.setData({ list: cleared })
            }, 650)
          })
        }, 820)
      })
    })
  },
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore) return
    if (!this.data.hasMore) {
      return
    }
    const nextPage = Number(this.data.page || 1) + 1
    this.reload({ reset: false, page: nextPage })
  },
  onTapCard(e) {
    if (Date.now() < Number(this._suppressTapUntil || 0)) return
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/news-detail/index?id=${encodeURIComponent(id)}` })
  },
  findNewsItemById(id) {
    const nid = String(id || "").trim()
    if (!nid) return null
    const list = Array.isArray(this.data.list) ? this.data.list : []
    for (const it of list) {
      if (it && it.id === nid) return it
    }
    const banners = Array.isArray(this.data.banners) ? this.data.banners : []
    for (const it of banners) {
      if (it && it.id === nid) return it
    }
    const w = this.data.welcome
    if (w && w.id === nid) return w
    return null
  },
  setTabbarVisible(visible) {
    if (typeof this.getTabBar !== "function") return
    const tb = this.getTabBar()
    if (tb && typeof tb.setVisible === "function") {
      tb.setVisible(Boolean(visible))
    }
  },
  onLongPressCard(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    const item = this.findNewsItemById(id)
    if (!item) return
    this._suppressTapUntil = Date.now() + 600
    clearTimeout(this._suppressTapTimer)
    this._suppressTapTimer = setTimeout(() => {
      this._suppressTapUntil = 0
    }, 700)
    clearTimeout(this._pressPreviewHideTimer)
    this.setData({ pressPreview: { show: true, active: false, item }, pressJiggleId: id }, () => {
      this.setTabbarVisible(false)
      wx.nextTick(() => {
        const pv = this.data.pressPreview
        if (!pv || !pv.show) return
        if (pv.active) return
        this.setData({ pressPreview: { ...pv, active: true } })
      })
    })
  },
  onReleasePressCard() {
    if (!this.data.pressPreview || !this.data.pressPreview.show) return
    this.onClosePressPreview()
  },
  onClosePressPreview() {
    const pv = this.data.pressPreview
    if (!pv || !pv.show) return
    clearTimeout(this._pressPreviewHideTimer)
    this.setData({ pressPreview: { ...pv, active: false }, pressJiggleId: "" })
    this._pressPreviewHideTimer = setTimeout(() => {
      this.setData({ pressPreview: null }, () => {
        this.setTabbarVisible(!this.data.showWelcome)
      })
    }, 170)
  },
  onTapPressPreview() {
    const pv = this.data.pressPreview
    const item = pv && pv.item
    const id = item && item.id ? item.id : ""
    if (!id) {
      this.onClosePressPreview()
      return
    }
    this.setData({ pressPreview: null }, () => {
      this.setTabbarVisible(true)
      wx.navigateTo({ url: `/pages/news-detail/index?id=${encodeURIComponent(id)}` })
    })
  },
  onCloseWelcome() {
    this.setData({ showWelcome: false }, () => {
      if (typeof this.getTabBar === "function") {
        const tb = this.getTabBar()
        if (tb && typeof tb.setVisible === "function") {
          tb.setVisible(true)
        }
      }
    })
  },
  noop() {},
  applyI18n() {
    const dict = i18n.getDict()
    if (this.data.i18n === dict) return
    const state = resolveRaceWeekTimelineState(this._raceWeekTimelineSessions, Date.now())
    const label = state && state.session && state.session.key ? this.getSessionLabel(state.session.key, dict) : ""
    this.setData({ i18n: dict, ...this.buildRaceWeekSessionLabelState(label) })
    this.updateRaceWeekDisplay()
    wx.setNavigationBarTitle({ title: dict.nav.news })
  }
})
