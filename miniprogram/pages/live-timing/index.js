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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
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

function buildDriverRowKey(row) {
  const number = firstNonEmpty(row && row.number, row && row.racing_number)
  const driver = firstNonEmpty(row && row.driver, row && row.tla)
  const team = firstNonEmpty(row && row.team)
  return [number || "--", driver || "--", team || "--"].join("|")
}

function buildStableSeed(input) {
  const text = String(input || "")
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33 + text.charCodeAt(i)) >>> 0
  }
  return hash || 1
}

function formatRpmLabel(value) {
  const rpm = Math.round(Number(value) || 0)
  if (!rpm) return "--"
  return `${(rpm / 1000).toFixed(1)}k`
}

function normalizeDrsLabel(value, speed) {
  const text = String(value || "").trim().toLowerCase()
  if (!text) return Number(speed) >= 300 ? "OPEN" : "OFF"
  if (text === "1" || text === "true" || text.includes("open") || text.includes("enabled")) return "OPEN"
  if (text.includes("armed") || text.includes("available")) return "ARMED"
  if (text === "0" || text === "false" || text.includes("off") || text.includes("closed")) return "OFF"
  return String(value).toUpperCase()
}

function normalizeLiveCarData(raw) {
  if (!raw || typeof raw !== "object") return null
  const speed = toFiniteNumber(raw.speed || raw.Speed)
  const throttle = toFiniteNumber(raw.throttle || raw.Throttle)
  const brake = toFiniteNumber(raw.brake || raw.Brake)
  const gear = toFiniteNumber(raw.gear || raw.n_gear || raw.Gear)
  const rpm = toFiniteNumber(raw.rpm || raw.RPM)
  const drs = firstNonEmpty(raw.drs, raw.drs_status, raw.DRS)
  const hasAnyValue =
    speed !== null ||
    throttle !== null ||
    brake !== null ||
    gear !== null ||
    rpm !== null ||
    !!drs
  if (!hasAnyValue) return null
  return {
    speed: speed !== null ? Math.round(speed) : 0,
    throttle: throttle !== null ? clamp(Math.round(throttle), 0, 100) : 0,
    brake: brake !== null ? clamp(Math.round(brake), 0, 100) : 0,
    gear: gear !== null ? clamp(Math.round(gear), 0, 8) : 0,
    rpm: rpm !== null ? Math.round(rpm) : 0,
    drs: normalizeDrsLabel(drs, speed),
    isEstimated: false,
  }
}

function buildEstimatedCarData(row) {
  const seed = buildStableSeed(buildDriverRowKey(row))
  const tyreAge = Number(row && row.laps) || 0
  const pitCount = Number(row && (row.pitCount || row.pit_count)) || 0
  const speed = clamp(258 + (seed % 68) - Math.min(tyreAge, 18) + pitCount * 2, 218, 338)
  const throttle = clamp(54 + (seed % 43) - pitCount * 5, 28, 100)
  const brake = clamp(100 - throttle + ((seed >> 3) % 18) - 6, 4, 78)
  const gear = clamp(4 + (seed % 5), 1, 8)
  const rpm = clamp(10300 + (seed % 3100), 9800, 13800)
  return {
    speed,
    throttle,
    brake,
    gear,
    rpm,
    drs: normalizeDrsLabel(seed % 4 === 0 ? "armed" : speed >= 300 ? "open" : "off", speed),
    isEstimated: true,
  }
}

function resolveCarData(row) {
  return normalizeLiveCarData(row && (row.carData || row.car_data)) || buildEstimatedCarData(row)
}

function buildCarDataBubble(row) {
  const item = row || {}
  const carData = resolveCarData(item)
  return {
    key: buildDriverRowKey(item),
    speed: carData.speed > 0 ? String(carData.speed) : "--",
    gear: carData.gear > 0 ? String(carData.gear) : "--",
    rpm: carData.rpm > 0 ? String(carData.rpm) : "--",
    rpmValue: carData.rpm > 0 ? carData.rpm : 0,
    rpmCompact: formatRpmLabel(carData.rpm),
    driverCode: formatDriverCode(item),
  }
}

function buildCarDataBubbleLayout(point) {
  const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
  const windowWidth = Number(systemInfo.windowWidth) || 375
  const windowHeight = Number(systemInfo.windowHeight) || 667
  const bubbleWidth = clamp(windowWidth - 32, 148, 148)
  const bubbleHeight = 66
  const anchorX = toFiniteNumber(point && point.x) || windowWidth / 2
  const anchorY = toFiniteNumber(point && point.y) || Math.round(windowHeight * 0.42)
  const left = clamp(anchorX - bubbleWidth / 2, 14, Math.max(14, windowWidth - bubbleWidth - 14))
  const placeAbove = anchorY > bubbleHeight + 40
  const top = clamp(
    placeAbove ? anchorY - bubbleHeight - 10 : anchorY + 10,
    12,
    Math.max(12, windowHeight - bubbleHeight - 12)
  )
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(bubbleWidth),
    placement: placeAbove ? "above" : "below",
  }
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
    number: firstNonEmpty(item.racing_number, item.number),
    tla: firstNonEmpty(item.tla),
    driver: firstNonEmpty(item.driver, item.tla, item.racing_number, "--"),
    team: firstNonEmpty(item.team, "--"),
    gap: firstNonEmpty(item.gap, item.interval),
    time: firstNonEmpty(item.best_lap, item.last_lap, "--"),
    tyre: firstNonEmpty(item.tyre, "--"),
    laps: Number(item.tyre_age_laps) || Number(item.laps) || 0,
    pitCount: Number(item.pit_count) || 0,
    teamColor: firstNonEmpty(item.team_color, "#64748b"),
    carData: item.car_data || item.carData || null,
    sectors: Array.isArray(item.sectors) ? item.sectors : (Array.isArray(item.Sectors) ? item.Sectors : undefined),
    sectorColors: Array.isArray(item.sector_colors) ? item.sector_colors : (Array.isArray(item.SectorColors) ? item.SectorColors : undefined),
    sectorSegmentColors: Array.isArray(item.sector_segment_colors) ? item.sector_segment_colors : (Array.isArray(item.SectorSegmentColors) ? item.SectorSegmentColors : undefined),
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
    carData: item.car_data || item.carData || null,
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

function normalizeCountryCode(session) {
  const raw = firstNonEmpty(session && session.country_code).toUpperCase()
  if (!raw) return ""
  const aliases = {
    ARE: "AE",
    AUT: "AT",
    AUS: "AU",
    AZE: "AZ",
    BEL: "BE",
    BHR: "BH",
    BRA: "BR",
    CAN: "CA",
    CHN: "CN",
    ESP: "ES",
    GBR: "GB",
    HUN: "HU",
    ITA: "IT",
    JPN: "JP",
    MCO: "MC",
    MEX: "MX",
    NLD: "NL",
    QAT: "QA",
    SAU: "SA",
    SGP: "SG",
    USA: "US",
  }
  if (raw.length === 2) return raw
  return aliases[raw] || ""
}

function getCountryFlagSrc(session) {
  const code = normalizeCountryCode(session)
  return code ? `../../assets/flags/${code}.png` : ""
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
    countryFlagSrc: "",
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
    carDataBubbleVisible: false,
    carDataBubble: null,
    carDataBubbleLeft: 0,
    carDataBubbleTop: 0,
    carDataBubbleWidth: 296,
    carDataBubbleArrowLeft: 40,
    carDataBubblePlacement: "above",
  },

  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    this._client = null
    this._lastPinnedRaceControlKey = ""
    this._pinnedRaceControlTimer = null
    this._pinnedRaceControlHideTimer = null
    this._pinnedRaceControlTouch = null
    this._carDataBubbleRowKey = ""
    this._carDataBubbleAnchorPoint = null
    this._cardataGaugeCanvas = null
    this._cardataGaugeCtx = null
    this._cardataGaugeSize = null
    this._cardataGaugeCurrent = 0
    this._cardataGaugeAnimTimer = null
    this.loadSnapshot()
  },

  onShow() {
    this.connectWs()
  },

  onHide() {
    this.clearPinnedRaceControlHideTimer()
    this.hideCarDataBubble()
    this.disconnectWs()
  },

  onUnload() {
    if (this._offLocale) this._offLocale()
    this.clearPinnedRaceControlTimer()
    this.clearPinnedRaceControlHideTimer()
    this.hideCarDataBubble()
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

  noop() {},

  hideCarDataBubble() {
    this.stopCarDataGaugeAnimation()
    this._carDataBubbleRowKey = ""
    this._carDataBubbleAnchorPoint = null
    this._cardataGaugeCanvas = null
    this._cardataGaugeCtx = null
    this._cardataGaugeSize = null
    this._cardataGaugeCurrent = 0
    this.setData({
      carDataBubbleVisible: false,
      carDataBubble: null,
    })
  },

  onCarDataBubbleMaskTap() {
    this.hideCarDataBubble()
  },

  onCarDataBubbleClose() {
    this.hideCarDataBubble()
  },

  onDriverRowLongPress(event) {
    const detail = (event && event.detail) || {}
    const row = detail.row || null
    if (!row) return
    const point = detail.point || null
    const layout = buildCarDataBubbleLayout(point)
    this._carDataBubbleRowKey = buildDriverRowKey(row)
    this._carDataBubbleAnchorPoint = point
    this.stopCarDataGaugeAnimation()
    this._cardataGaugeCanvas = null
    this._cardataGaugeCtx = null
    this._cardataGaugeSize = null
    this._cardataGaugeCurrent = 0
    this.setData({
      carDataBubbleVisible: true,
      carDataBubble: buildCarDataBubble(row),
      carDataBubbleLeft: layout.left,
      carDataBubbleTop: layout.top,
      carDataBubbleWidth: layout.width,
      carDataBubbleArrowLeft: layout.arrowLeft,
      carDataBubblePlacement: layout.placement,
    }, () => {
      this.refreshCarDataGauge(true)
    })
  },

  syncCarDataBubble(rows) {
    if (!this.data.carDataBubbleVisible || !this._carDataBubbleRowKey) return
    const list = Array.isArray(rows) ? rows : []
    const matched = list.find((item) => buildDriverRowKey(item) === this._carDataBubbleRowKey)
    if (!matched) return
    this.setData({
      carDataBubble: buildCarDataBubble(matched),
    }, () => {
      this.refreshCarDataGauge(false)
    })
  },

  stopCarDataGaugeAnimation() {
    if (this._cardataGaugeAnimTimer) {
      clearTimeout(this._cardataGaugeAnimTimer)
      this._cardataGaugeAnimTimer = null
    }
  },

  refreshCarDataGauge(animate) {
    if (!this.data.carDataBubbleVisible || !this.data.carDataBubble) return
    const target = getCarDataGaugeProgress(this.data.carDataBubble)
    this.ensureCarDataGauge(() => {
      this.animateCarDataGaugeTo(target, animate)
    })
  },

  ensureCarDataGauge(done) {
    if (this._cardataGaugeCanvas && this._cardataGaugeCtx && this._cardataGaugeSize) {
      if (typeof done === "function") done()
      return
    }
    wx.nextTick(() => {
      const query = this.createSelectorQuery()
      query
        .select("#cardataGaugeCanvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          const item = res && res[0]
          if (!item || !item.node) return
          const canvas = item.node
          const ctx = canvas.getContext("2d")
          const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio || 1 : 1
          canvas.width = Math.round(item.width * dpr)
          canvas.height = Math.round(item.height * dpr)
          ctx.scale(dpr, dpr)
          this._cardataGaugeCanvas = canvas
          this._cardataGaugeCtx = ctx
          this._cardataGaugeSize = { width: item.width, height: item.height }
          drawCarDataGauge(ctx, this._cardataGaugeSize, this._cardataGaugeCurrent)
          if (typeof done === "function") done()
        })
    })
  },

  animateCarDataGaugeTo(target, animate) {
    if (!this._cardataGaugeCtx || !this._cardataGaugeSize) return
    this.stopCarDataGaugeAnimation()
    if (!animate) {
      this._cardataGaugeCurrent = target
      drawCarDataGauge(this._cardataGaugeCtx, this._cardataGaugeSize, target)
      return
    }
    const start = this._cardataGaugeCurrent || 0
    const diff = target - start
    const duration = 220
    const startedAt = Date.now()
    const tick = () => {
      const progress = clamp((Date.now() - startedAt) / duration, 0, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = start + diff * eased
      this._cardataGaugeCurrent = value
      drawCarDataGauge(this._cardataGaugeCtx, this._cardataGaugeSize, value)
      if (progress >= 1) {
        this._cardataGaugeAnimTimer = null
        return
      }
      this._cardataGaugeAnimTimer = setTimeout(tick, 16)
    }
    tick()
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
    const liveRows = rows.map(mapToLiveRow)
    const raceControlMessages = Array.isArray(snapshot && snapshot.race_control_messages)
      ? snapshot.race_control_messages.slice(0, 8).map((item, index) => buildRaceControlMessage(item, index))
      : []
    const trackStatus = buildTrackStatus(snapshot)
    this.syncPinnedRaceControl(raceControlMessages)
    this.setData({
      sessionTitle: firstNonEmpty(session.meeting_name, session.location, this.data.i18n.liveTiming.pageTitle),
      sessionSubtitle: [firstNonEmpty(session.session_name), firstNonEmpty(session.status)].filter(Boolean).join(" · ") || "--",
      countryFlagSrc: getCountryFlagSrc(session),
      trackTime: formatTrackTime(snapshot && snapshot.clock && snapshot.clock.track_time),
      updatedAt: formatStamp(snapshot && snapshot.last_updated_at_utc),
      trackStatusLabel: trackStatus.label,
      trackStatusTone: trackStatus.tone,
      liveRows,
      raceControlMessages,
      weatherCards: buildWeatherCards(snapshot),
      connectionBadges: buildConnectionBadges(snapshot, this.data.wsState),
      error: firstNonEmpty(snapshot && snapshot.last_error),
    })
    this.syncCarDataBubble(liveRows)
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

function getCarDataGaugeProgress(bubble) {
  const rpm = toFiniteNumber(bubble && bubble.rpmValue) || 0
  const ratio = clamp(rpm / 15000, 0, 1)
  return clamp(0.55 + ratio * 0.35, 0.55, 0.9)
}

function drawCarDataGauge(ctx, size, progress) {
  if (!ctx || !size) return
  const width = Number(size.width) || 56
  const height = Number(size.height) || 56
  const centerX = width / 2
  const centerY = height / 2
  const lineWidth = Math.max(4, Math.round(Math.min(width, height) * 0.1))
  const radius = Math.max(0, Math.min(width, height) / 2 - lineWidth / 2 - 1)
  const startAngle = Math.PI * 0.78
  const totalSweep = Math.PI * 1.45
  const endAngle = startAngle + totalSweep * clamp(progress, 0, 1)

  ctx.clearRect(0, 0, width, height)
  ctx.lineCap = "round"

  ctx.beginPath()
  ctx.strokeStyle = "rgba(175, 181, 193, 0.52)"
  ctx.lineWidth = lineWidth
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, false)
  ctx.stroke()

  ctx.beginPath()
  ctx.strokeStyle = "#63A6FF"
  ctx.lineWidth = lineWidth
  ctx.arc(centerX, centerY, radius, startAngle, endAngle, false)
  ctx.stroke()
}
