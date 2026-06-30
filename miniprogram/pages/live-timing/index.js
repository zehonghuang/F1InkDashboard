const i18n = require("../../services/i18n")
const { fetchF1LiveTimingSnapshot, createF1LiveTimingClient } = require("../../services/f1LiveTimingService")

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i]
    if (value === undefined || value === null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ""
}

function formatTrackTime(value) {
  if (!value) return "--"
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && numeric > 1000000000) {
    const date = new Date(numeric)
    if (!Number.isNaN(date.getTime())) {
      const ms = String(date.getMilliseconds()).padStart(3, "0")
      const hh = String(date.getHours()).padStart(2, "0")
      const mm = String(date.getMinutes()).padStart(2, "0")
      const ss = String(date.getSeconds()).padStart(2, "0")
      return `${hh}:${mm}:${ss}.${ms}`
    }
  }
  return String(value)
}

function formatStamp(value) {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mi = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function formatDriverCode(row) {
  const tla = firstNonEmpty(row && row.tla)
  if (tla) return tla.toUpperCase()
  const driver = firstNonEmpty(row && row.driver)
  if (!driver) return "--"
  const parts = driver.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0].charAt(0).toUpperCase()} ${parts[parts.length - 1].toUpperCase()}`
  return driver.slice(0, 3).toUpperCase()
}

function normalizeTyre(row) {
  const raw = firstNonEmpty(row && row.tyre)
  if (!raw) return "--"
  const upper = raw.toUpperCase()
  const age = Number(row && row.tyre_age_laps) || 0
  const parts = []
  if (upper.includes("SOFT")) parts.push("SOFT")
  else if (upper.includes("MED")) parts.push("MEDIUM")
  else if (upper.includes("HARD")) parts.push("HARD")
  else if (upper.includes("INTER")) parts.push("INTER")
  else if (upper.includes("WET")) parts.push("WET")
  else parts.push(upper)
  if (age > 0) parts.push(`${age}L`)
  if (row && row.is_new_tyre) parts.push("new")
  return parts.join(" ")
}

function mapToLiveRow(row) {
  const item = row || {}
  return {
    position: Number(item.position) || 0,
    driver: firstNonEmpty(item.driver, item.tla, item.racing_number, "--"),
    team: firstNonEmpty(item.team, "--"),
    gap: firstNonEmpty(item.gap, item.interval),
    time: firstNonEmpty(item.best_lap, item.last_lap, "--"),
    tyre: firstNonEmpty(item.tyre, "--"),
    laps: Number(item.tyre_age_laps) || Number(item.laps) || 0,
    pitCount: Number(item.pit_count) || 0,
    teamColor: firstNonEmpty(item.team_color, "#64748b"),
  }
}

function mapToQualifyingRow(row) {
  const item = row || {}
  return {
    pos: Number(item.position) || 0,
    driver: firstNonEmpty(item.driver, "--"),
    team: firstNonEmpty(item.team, "--"),
    number: Number(item.racing_number) || 0,
    laps: Number(item.laps) || 0,
    gap: firstNonEmpty(item.gap),
    time: firstNonEmpty(item.best_lap, item.last_lap, "--"),
    interval: firstNonEmpty(item.interval),
    tyre: normalizeTyre(item),
    teamColor: firstNonEmpty(item.team_color, "#64748b"),
    carAccent: firstNonEmpty(item.team_color, "#64748b"),
  }
}

function buildWeatherCards(snapshot) {
  const weather = (snapshot && snapshot.weather) || {}
  return [
    { label: "TRACK", value: firstNonEmpty(weather.track_temp, "--"), suffix: "C" },
    { label: "AIR", value: firstNonEmpty(weather.air_temp, "--"), suffix: "C" },
    { label: "HUM", value: firstNonEmpty(weather.humidity, "--"), suffix: "%" },
    { label: "WIND", value: firstNonEmpty(weather.wind_speed, "--"), suffix: firstNonEmpty(weather.wind_direction, "") },
  ]
}

function buildTrackStatus(snapshot) {
  const message = firstNonEmpty(snapshot && snapshot.track_status && snapshot.track_status.message, "Unknown")
  const text = message.toLowerCase()
  let tone = "neutral"
  if (text.includes("clear") || text.includes("green")) tone = "green"
  else if (text.includes("yellow") || text.includes("sc") || text.includes("vsc")) tone = "yellow"
  else if (text.includes("red")) tone = "red"
  return { label: message, tone }
}

function buildConnectionBadges(snapshot, wsState) {
  return [
    { label: "Backend", value: snapshot && snapshot.connected ? "Connected" : "Offline", tone: snapshot && snapshot.connected ? "green" : "neutral" },
    { label: "WS", value: wsState || "idle", tone: wsState === "open" ? "green" : wsState === "connecting" ? "yellow" : "neutral" },
    { label: "Seq", value: String((snapshot && snapshot.seq) || 0), tone: "neutral" },
    { label: "Latency", value: `${snapshot && snapshot.query_latency_ms ? snapshot.query_latency_ms : "--"} ms`, tone: "neutral" },
  ]
}

function buildRaceControlMessage(item, index) {
  return {
    id: `${item && item.utc ? item.utc : "msg"}-${index}`,
    title: firstNonEmpty(item && item.title, item && item.category, "Info"),
    flag: firstNonEmpty(item && item.flag, item && item.category, "INFO"),
    message: firstNonEmpty(item && item.message, "--"),
    time: formatStamp(item && item.utc),
    tone: buildRaceControlTone(firstNonEmpty(item && item.flag, item && item.category, "")),
  }
}

function buildRaceControlTone(flag) {
  const text = String(flag || "").toLowerCase()
  if (text.includes("red")) return "red"
  if (text.includes("yellow") || text.includes("sc") || text.includes("vsc")) return "yellow"
  if (text.includes("green") || text.includes("clear")) return "green"
  return "neutral"
}

Page({
  data: {
    i18n: i18n.getDict(),
    loading: true,
    error: "",
    wsState: "idle",
    sessionTitle: "--",
    sessionSubtitle: "--",
    trackTime: "--",
    updatedAt: "--",
    trackStatusLabel: "Unknown",
    trackStatusTone: "neutral",
    liveRows: [],
    qualifyingRows: [],
    raceControlMessages: [],
    pinnedRaceControl: null,
    pinnedRaceControlOffsetY: 0,
    pinnedRaceControlOpacity: 1,
    pinnedRaceControlTransition: "transform 220ms ease, opacity 220ms ease",
    weatherCards: [],
    connectionBadges: [],
  },

  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    this._client = null
    this._lastPinnedRaceControlKey = ""
    this._pinnedRaceControlTimer = null
    this._pinnedRaceControlHideTimer = null
    this._pinnedRaceControlTouch = null
    this.loadSnapshot()
  },

  onShow() {
    this.connectWs()
  },

  onHide() {
    this.clearPinnedRaceControlHideTimer()
    this.disconnectWs()
  },

  onUnload() {
    if (this._offLocale) this._offLocale()
    this.clearPinnedRaceControlTimer()
    this.clearPinnedRaceControlHideTimer()
    this.disconnectWs()
  },

  onPullDownRefresh() {
    this.loadSnapshot().finally(() => wx.stopPullDownRefresh())
  },

  applyI18n() {
    this.setData({ i18n: i18n.getDict() })
  },

  setWsState(nextState) {
    const wsState = String(nextState || "idle")
    this.setData({
      wsState,
      connectionBadges: buildConnectionBadges(this._lastSnapshot, wsState),
    })
  },

  clearPinnedRaceControlTimer() {
    if (this._pinnedRaceControlTimer) {
      clearTimeout(this._pinnedRaceControlTimer)
      this._pinnedRaceControlTimer = null
    }
  },

  clearPinnedRaceControlHideTimer() {
    if (this._pinnedRaceControlHideTimer) {
      clearTimeout(this._pinnedRaceControlHideTimer)
      this._pinnedRaceControlHideTimer = null
    }
  },

  armPinnedRaceControlTimer() {
    this.clearPinnedRaceControlTimer()
    if (!this.data.pinnedRaceControl) return
    this._pinnedRaceControlTimer = setTimeout(() => {
      this._pinnedRaceControlTimer = null
      this.hidePinnedRaceControl()
    }, 30000)
  },

  showPinnedRaceControl(message) {
    if (!message) return
    this.clearPinnedRaceControlHideTimer()
    this.setData({
      pinnedRaceControl: message,
      pinnedRaceControlTransition: "none",
      pinnedRaceControlOffsetY: -64,
      pinnedRaceControlOpacity: 0,
    })
    setTimeout(() => {
      if (!this.data.pinnedRaceControl || this.data.pinnedRaceControl.id !== message.id) return
      this.setData({
        pinnedRaceControlTransition: "transform 220ms ease, opacity 220ms ease",
        pinnedRaceControlOffsetY: 0,
        pinnedRaceControlOpacity: 1,
      })
      this.armPinnedRaceControlTimer()
    }, 16)
  },

  hidePinnedRaceControl() {
    if (!this.data.pinnedRaceControl) return
    this.clearPinnedRaceControlTimer()
    this.clearPinnedRaceControlHideTimer()
    this.setData({
      pinnedRaceControlTransition: "transform 180ms ease, opacity 180ms ease",
      pinnedRaceControlOffsetY: -132,
      pinnedRaceControlOpacity: 0,
    })
    this._pinnedRaceControlHideTimer = setTimeout(() => {
      this._pinnedRaceControlHideTimer = null
      this.setData({
        pinnedRaceControl: null,
        pinnedRaceControlOffsetY: 0,
        pinnedRaceControlOpacity: 1,
        pinnedRaceControlTransition: "transform 220ms ease, opacity 220ms ease",
      })
    }, 180)
  },

  pinRaceControlMessage(message) {
    this.clearPinnedRaceControlTimer()
    this.showPinnedRaceControl(message)
  },

  syncPinnedRaceControl(raceControlMessages) {
    const latest = Array.isArray(raceControlMessages) && raceControlMessages.length ? raceControlMessages[0] : null
    if (!latest) return
    const key = `${latest.id}|${latest.message}|${latest.time}`
    if (key === this._lastPinnedRaceControlKey) return
    this._lastPinnedRaceControlKey = key
    this.pinRaceControlMessage(latest)
  },

  onPinnedRaceControlTouchStart(event) {
    if (!this.data.pinnedRaceControl) return
    this.clearPinnedRaceControlTimer()
    const touch = event && event.touches && event.touches[0]
    if (!touch) return
    this._pinnedRaceControlTouch = {
      startX: touch.clientX,
      startY: touch.clientY,
      dragging: false,
      canceled: false,
    }
    this.setData({
      pinnedRaceControlTransition: "none",
    })
  },

  onPinnedRaceControlTouchMove(event) {
    if (!this.data.pinnedRaceControl || !this._pinnedRaceControlTouch) return
    const touch = event && event.touches && event.touches[0]
    if (!touch) return
    const deltaX = touch.clientX - this._pinnedRaceControlTouch.startX
    const deltaY = touch.clientY - this._pinnedRaceControlTouch.startY

    if (!this._pinnedRaceControlTouch.dragging) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return
      if (deltaY >= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
        this._pinnedRaceControlTouch.canceled = true
        return
      }
      this._pinnedRaceControlTouch.dragging = true
    }

    if (this._pinnedRaceControlTouch.canceled) return
    const offsetY = Math.max(-160, Math.min(0, deltaY))
    const opacity = Math.max(0.24, 1 + offsetY / 160)
    this.setData({
      pinnedRaceControlOffsetY: offsetY,
      pinnedRaceControlOpacity: opacity,
    })
  },

  onPinnedRaceControlTouchEnd() {
    const touchState = this._pinnedRaceControlTouch
    this._pinnedRaceControlTouch = null
    if (!this.data.pinnedRaceControl) return
    if (!touchState || touchState.canceled || !touchState.dragging) {
      this.setData({
        pinnedRaceControlTransition: "transform 180ms ease, opacity 180ms ease",
        pinnedRaceControlOffsetY: 0,
        pinnedRaceControlOpacity: 1,
      })
      this.armPinnedRaceControlTimer()
      return
    }

    if (this.data.pinnedRaceControlOffsetY <= -72) {
      this.hidePinnedRaceControl()
      return
    }

    this.setData({
      pinnedRaceControlTransition: "transform 180ms ease, opacity 180ms ease",
      pinnedRaceControlOffsetY: 0,
      pinnedRaceControlOpacity: 1,
    })
    this.armPinnedRaceControlTimer()
  },

  onPinnedRaceControlClose() {
    this.hidePinnedRaceControl()
  },

  async loadSnapshot() {
    this.setData({ loading: true, error: "" })
    try {
      const data = await fetchF1LiveTimingSnapshot()
      this.applySnapshot((data && data.status) || null)
    } catch (err) {
      console.error("[live-timing-page] load snapshot failed", err)
      this.setData({
        error: i18n.t("liveTiming.loadFailed"),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  applySnapshot(snapshot) {
    this._lastSnapshot = snapshot || null
    const rows = Array.isArray(snapshot && snapshot.rows) ? snapshot.rows : []
    const session = (snapshot && snapshot.session) || {}
    const topRows = rows.slice(0, 8).map(mapToLiveRow)
    const qualifyingRows = rows.map(mapToQualifyingRow)
    const raceControlMessages = Array.isArray(snapshot && snapshot.race_control_messages)
      ? snapshot.race_control_messages.slice(0, 8).map((item, index) => buildRaceControlMessage(item, index))
      : []
    const trackStatus = buildTrackStatus(snapshot)
    this.syncPinnedRaceControl(raceControlMessages)
    this.setData({
      sessionTitle: firstNonEmpty(session.meeting_name, session.location, this.data.i18n.liveTiming.pageTitle),
      sessionSubtitle: [firstNonEmpty(session.session_name), firstNonEmpty(session.status)].filter(Boolean).join(" · ") || "--",
      trackTime: formatTrackTime(snapshot && snapshot.clock && snapshot.clock.track_time),
      updatedAt: formatStamp(snapshot && snapshot.last_updated_at_utc),
      trackStatusLabel: trackStatus.label,
      trackStatusTone: trackStatus.tone,
      liveRows: topRows,
      qualifyingRows,
      raceControlMessages,
      weatherCards: buildWeatherCards(snapshot),
      connectionBadges: buildConnectionBadges(snapshot, this.data.wsState),
      error: firstNonEmpty(snapshot && snapshot.last_error),
    })
  },

  connectWs() {
    if (this._client) return
    this.setWsState("connecting")
    this._client = createF1LiveTimingClient({
      onOpen: () => {
        this.setWsState("open")
      },
      onClose: () => {
        this.setWsState("closed")
      },
      onError: (err) => {
        console.error("[live-timing-page] ws error", err)
        this.setWsState("error")
      },
      onSnapshot: (snapshot) => {
        this.applySnapshot(snapshot)
      },
    })
    this._client.connect()
  },

  disconnectWs() {
    if (!this._client) return
    this._client.disconnect()
    this._client = null
    this.setWsState("closed")
  },
})
