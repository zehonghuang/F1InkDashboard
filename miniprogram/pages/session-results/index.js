const { buildChartsShareUrl } = require("../../services/chartsShare")
const { getAuthState } = require("../../services/authService")
const i18n = require("../../services/i18n")

const CHART_GUIDE_STORAGE_KEY = "session_results_chart_guide_seen_v1"
const SWIPE_THRESHOLD_PX = 56
const SWIPE_MAX_VERTICAL_DELTA_PX = 42
const TAB_TRANSITION_OFFSET_PX = 26
const TAB_TRANSITION_DURATION_MS = 240
const TELEMETRY_DRAG_MAX_PX = 34
const TELEMETRY_DRAG_RESISTANCE = 0.22

Page({
  data: {
    i18n: i18n.getDict(),
    raceName: "",
    sessionName: "",
    sessionCode: "",
    sessionKey: 0,
    items: [],
    tabs: [],
    activeTabKey: "rank",
    chartOptionBoxplot: null,
    boxplotHeightRpx: 520,
    boxplotSummaryCards: [],
    boxplotHintText: "",
    selectedDriverNumbers: [],
    selectedDriverText: "",
    chartOptionThrottle: null,
    chartOptionBrake: null,
    chartOptionSpeed: null,
    chartOptionTelemetry: null,
    telemetryHeightRpx: 520,
    telemetryDriverNumbers: [],
    telemetrySelectedText: "",
    telemetryLapInfo: "",
    telemetrySectorCards: [],
    telemetryInsightTitle: "",
    telemetryInsightText: "",
    showPicker: false,
    pickerMode: "",
    pickedDriverNumbers: [],
    pickedMap: {},
    chartGuideVisible: false,
    chartGuideTitle: "",
    chartGuideText: "",
    tabSwiperCurrent: 0,
    tabSwiperHeightPx: 520,
    telemetryPanels: {},
    tabPanelAnimation: null,
    tabMaskAnimation: null,
    tabTransitionMaskClass: "",
    tabIndicatorStyle: "opacity:0;",
    telemetryDragStyle: "",
    telemetryEdgeLeftStyle: "opacity:0;",
    telemetryEdgeRightStyle: "opacity:0;"
  },
  scheduleTabIndicatorUpdate(immediate) {
    if (this._tabIndicatorTimer) {
      clearTimeout(this._tabIndicatorTimer)
      this._tabIndicatorTimer = null
    }
    this._tabIndicatorTimer = setTimeout(() => {
      this._tabIndicatorTimer = null
      this.updateTabIndicator(immediate)
    }, 16)
  },
  scheduleActivePanelMeasure() {
    if (this._panelMeasureTimer) {
      clearTimeout(this._panelMeasureTimer)
      this._panelMeasureTimer = null
    }
    this._panelMeasureTimer = setTimeout(() => {
      this._panelMeasureTimer = null
      this.updateActivePanelHeight()
    }, 32)
  },
  updateActivePanelHeight() {
    const key = String(this.data.activeTabKey || "")
    if (!key) return
    const query = wx.createSelectorQuery().in(this)
    query.select(`#tab-panel-${key}`).boundingClientRect()
    query.exec((res) => {
      const rect = res && res[0] ? res[0] : null
      const h = rect && Number(rect.height)
      if (Number.isFinite(h) && h > 0) {
        const next = Math.max(320, Math.ceil(h))
        if (next !== this.data.tabSwiperHeightPx) {
          this.setData({ tabSwiperHeightPx: next })
        }
      }
    })
  },
  updateTabIndicator(immediate) {
    const tabs = Array.isArray(this.data.tabs) ? this.data.tabs : []
    const activeIndex = this.getTabIndex(this.data.activeTabKey)
    if (!tabs.length || activeIndex < 0) {
      if (this.data.tabIndicatorStyle !== "opacity:0;") {
        this.setData({ tabIndicatorStyle: "opacity:0;" })
      }
      return
    }
    const query = wx.createSelectorQuery().in(this)
    query.select(".dp-tabs").boundingClientRect()
    query.selectAll(".sr-tab-item").boundingClientRect()
    query.exec((res) => {
      const wrap = res && res[0] ? res[0] : null
      const rects = res && Array.isArray(res[1]) ? res[1] : []
      const rect = rects[activeIndex]
      if (!wrap || !rect) return
      const left = Math.max(0, Number(rect.left) - Number(wrap.left))
      const width = Math.max(0, Number(rect.width) || 0)
      const duration = immediate ? 0 : TAB_TRANSITION_DURATION_MS
      const style = `opacity:1; width:${width}px; transform:translateX(${left}px); transition: transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), width ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease;`
      if (style !== this.data.tabIndicatorStyle) {
        this.setData({ tabIndicatorStyle: style })
      }
    })
  },
  getTabIndex(tabKey) {
    const key = String(tabKey || "")
    const tabs = Array.isArray(this.data.tabs) ? this.data.tabs : []
    return tabs.findIndex((tab) => tab && tab.key === key)
  },
  resolveTabDirection(nextKey) {
    const nextIndex = this.getTabIndex(nextKey)
    const currentIndex = this.getTabIndex(this.data.activeTabKey)
    if (nextIndex < 0 || currentIndex < 0 || nextIndex === currentIndex) return 0
    return nextIndex > currentIndex ? 1 : -1
  },
  playTabTransition(direction) {
    const dir = Number(direction)
    if (!dir || typeof wx.createAnimation !== "function") {
      this.setData({ tabPanelAnimation: null, tabMaskAnimation: null, tabTransitionMaskClass: "" })
      return
    }
    if (this._tabTransitionTimer) {
      clearTimeout(this._tabTransitionTimer)
      this._tabTransitionTimer = null
    }
    const offset = dir > 0 ? TAB_TRANSITION_OFFSET_PX : -TAB_TRANSITION_OFFSET_PX
    const from = wx.createAnimation({ timingFunction: "linear" })
    from.opacity(0.42).translateX(offset).scale(0.986, 0.986).step({ duration: 0 })
    const maskFrom = wx.createAnimation({ timingFunction: "linear" })
    maskFrom.opacity(0.18).step({ duration: 0 })
    this.setData({
      tabPanelAnimation: from.export(),
      tabMaskAnimation: maskFrom.export(),
      tabTransitionMaskClass: dir > 0 ? "tab-transition-mask-right" : "tab-transition-mask-left"
    })
    this._tabTransitionTimer = setTimeout(() => {
      const to = wx.createAnimation({ timingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" })
      to.opacity(1).translateX(0).scale(1, 1).step({ duration: TAB_TRANSITION_DURATION_MS })
      const maskTo = wx.createAnimation({ timingFunction: "ease-out" })
      maskTo.opacity(0).step({ duration: TAB_TRANSITION_DURATION_MS + 40 })
      this.setData({ tabPanelAnimation: to.export(), tabMaskAnimation: maskTo.export() })
      this._tabTransitionTimer = null
    }, 16)
  },
  isTelemetryTab(tabKey) {
    const key = String(tabKey || "")
    return key === "throttle" || key === "brake" || key === "speed"
  },
  canSwipeTelemetry(offset) {
    const step = Number(offset)
    if (!Number.isFinite(step) || !step) return false
    const cur = String(this.data.activeTabKey || "")
    const index = this.getTabIndex(cur)
    const tabs = Array.isArray(this.data.tabs) ? this.data.tabs : []
    if (index < 0) return false
    const next = tabs[index + step]
    return !!(next && next.key && this.isTelemetryTab(next.key))
  },
  switchTelemetryTabByOffset(offset) {
    const step = Number(offset)
    if (!Number.isFinite(step) || !step) return false
    const cur = String(this.data.activeTabKey || "")
    const index = this.getTabIndex(cur)
    const tabs = Array.isArray(this.data.tabs) ? this.data.tabs : []
    if (index < 0) return false
    const next = tabs[index + step]
    if (!next || !next.key || !this.isTelemetryTab(next.key)) return false
    return this.switchToTab(next.key, { direction: step })
  },
  updateTelemetryEdgeStyles(dx) {
    const cur = String(this.data.activeTabKey || "")
    if (!this.isTelemetryTab(cur)) {
      if (this.data.telemetryEdgeLeftStyle !== "opacity:0;" || this.data.telemetryEdgeRightStyle !== "opacity:0;") {
        this.setData({ telemetryEdgeLeftStyle: "opacity:0;", telemetryEdgeRightStyle: "opacity:0;" })
      }
      return
    }
    const leftAvailable = this.canSwipeTelemetry(-1)
    const rightAvailable = this.canSwipeTelemetry(1)
    const drag = Number(dx)
    const leftOpacity = leftAvailable && drag > 0 ? Math.min(0.2, drag / 180) : 0
    const rightOpacity = rightAvailable && drag < 0 ? Math.min(0.2, Math.abs(drag) / 180) : 0
    this.setData({
      telemetryEdgeLeftStyle: `opacity:${leftOpacity.toFixed(3)};`,
      telemetryEdgeRightStyle: `opacity:${rightOpacity.toFixed(3)};`
    })
  },
  resetTelemetryDrag(animateBack) {
    const style = animateBack
      ? "transform: translate3d(0, 0, 0); transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease; opacity:1;"
      : ""
    const updates = {
      telemetryDragStyle: style,
      telemetryEdgeLeftStyle: "opacity:0;",
      telemetryEdgeRightStyle: "opacity:0;"
    }
    this.setData(updates)
    if (animateBack) {
      if (this._telemetryDragResetTimer) {
        clearTimeout(this._telemetryDragResetTimer)
        this._telemetryDragResetTimer = null
      }
      this._telemetryDragResetTimer = setTimeout(() => {
        this._telemetryDragResetTimer = null
        this.setData({ telemetryDragStyle: "" })
      }, 220)
    }
  },
  getGuideCategory(tabKey) {
    const key = String(tabKey || "")
    if (key === "boxplot") return "boxplot"
    if (key === "throttle" || key === "brake" || key === "speed") return "telemetry"
    return ""
  },
  loadChartGuideSeenState() {
    try {
      const stored = wx.getStorageSync(CHART_GUIDE_STORAGE_KEY)
      return stored && typeof stored === "object" ? stored : {}
    } catch (e) {
      return {}
    }
  },
  persistChartGuideSeenState() {
    try {
      wx.setStorageSync(CHART_GUIDE_STORAGE_KEY, this._chartGuideSeen || {})
    } catch (e) {}
  },
  getChartGuideMeta(tabKey) {
    const category = this.getGuideCategory(tabKey)
    if (!category) return null
    const dict = i18n.getDict()
    return category === "boxplot"
      ? {
          category,
          title: dict.sessionResults.chartGuideTitle,
          text: `${dict.sessionResults.chartGuideGesture} ${dict.sessionResults.chartGuideDivider} ${dict.sessionResults.chartGuideBoxplot}`
        }
      : {
          category,
          title: dict.sessionResults.chartGuideTitle,
          text: `${dict.sessionResults.chartGuideGesture} ${dict.sessionResults.chartGuideDivider} ${dict.sessionResults.chartGuideTelemetry}`
        }
  },
  refreshChartGuide(tabKey) {
    const meta = this.getChartGuideMeta(tabKey)
    if (!meta) {
      if (this.data.chartGuideVisible || this.data.chartGuideTitle || this.data.chartGuideText) {
        this.setData({ chartGuideVisible: false, chartGuideTitle: "", chartGuideText: "" })
      }
      return
    }
    const visible = !this._chartGuideSeen || this._chartGuideSeen[meta.category] !== "1"
    this.setData({
      chartGuideVisible: visible,
      chartGuideTitle: meta.title,
      chartGuideText: meta.text
    })
  },
  markChartGuideSeen(tabKey) {
    const category = this.getGuideCategory(tabKey)
    if (!category) return
    if (!this._chartGuideSeen) this._chartGuideSeen = {}
    if (this._chartGuideSeen[category] === "1") return
    this._chartGuideSeen[category] = "1"
    this.persistChartGuideSeenState()
  },
  onDismissChartGuide() {
    const key = String(this.data.activeTabKey || "")
    this.markChartGuideSeen(key)
    this.setData({ chartGuideVisible: false })
  },
  applyActiveTabState(nextKey) {
    const key = String(nextKey || "")
    this.scheduleTabIndicatorUpdate(false)
    this.refreshChartGuide(key)
    if (key === "boxplot") {
      this.updateBoxplotHeight()
      this.loadBoxplot()
      this.scheduleActivePanelMeasure()
      return
    }
    if (key === "throttle" || key === "brake" || key === "speed") {
      this.updateTelemetryHeight()
      const ready =
        key === "throttle"
          ? !!this.data.chartOptionThrottle
          : key === "brake"
            ? !!this.data.chartOptionBrake
            : !!this.data.chartOptionSpeed
      if (ready) {
        this.syncTelemetryOption()
        this.syncTelemetryInsights()
        this.scheduleActivePanelMeasure()
      } else {
        this.loadTelemetry()
      }
      return
    }
    this.setData({ chartGuideVisible: false }, () => this.scheduleActivePanelMeasure())
  },
  ensureLoggedIn() {
    const s = getAuthState()
    if (s && s.isLoggedIn) return true
    wx.showModal({
      title: i18n.t("sessionResults.needLogin"),
      content: i18n.t("sessionResults.loginToCompare"),
      confirmText: i18n.t("sessionResults.goLogin"),
      cancelText: i18n.t("common.cancel"),
      success: (res) => {
        if (res && res.confirm) {
          wx.switchTab({ url: "/pages/mine/index" })
        }
      }
    })
    return false
  },
  buildTabs(sessionCode, sessionName) {
    const dict = i18n.getDict()
    const code = String(sessionCode || "")
      .trim()
      .toUpperCase()
    const name = String(sessionName || "").trim()
    const isRace = code === "RACE" || (/正赛/.test(name) && !/排位/.test(name))
    const isSprintRace =
      code === "SPRINT" || /冲刺赛正赛/.test(name) || (/\bsprint\b/i.test(name) && !/\bqual/i.test(name))
    const isQuali = code === "Q" || /排位/.test(name) || /\bqual/i.test(name)
    const isSprintQuali = code === "SQ" || /冲刺赛排位/.test(name) || (/\bsprint\b/i.test(name) && /\bqual/i.test(name))

    if (isRace || isSprintRace) {
      return [
        { key: "rank", label: dict.sessionResults.tabRank },
        { key: "boxplot", label: dict.sessionResults.tabBoxplot }
      ]
    }
    if (isQuali || isSprintQuali) {
      return [
        { key: "rank", label: dict.sessionResults.tabRank },
        { key: "throttle", label: dict.sessionResults.tabThrottle },
        { key: "brake", label: dict.sessionResults.tabBrake },
        { key: "speed", label: dict.sessionResults.tabSpeed }
      ]
    }
    return [{ key: "rank", label: dict.sessionResults.tabRank }]
  },
  hasTab(key) {
    return (this.data.tabs || []).some((t) => t && t.key === key)
  },
  syncTelemetryOption() {
    const k = String(this.data.activeTabKey || "")
    const opt =
      k === "throttle"
        ? this.data.chartOptionThrottle
        : k === "brake"
          ? this.data.chartOptionBrake
          : k === "speed"
            ? this.data.chartOptionSpeed
            : null
    if (opt !== this.data.chartOptionTelemetry) {
      this.setData({ chartOptionTelemetry: opt })
    }
  },
  normalizeTeamColor(v) {
    const s = String(v || "").trim()
    if (!s) return ""
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase()
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`.toUpperCase()
    return ""
  },
  hexToRgba(hex, alpha) {
    const h = this.normalizeTeamColor(hex)
    if (!h) return ""
    const r = parseInt(h.slice(1, 3), 16)
    const g = parseInt(h.slice(3, 5), 16)
    const b = parseInt(h.slice(5, 7), 16)
    const a = Number(alpha)
    const aa = Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1
    return `rgba(${r},${g},${b},${aa})`
  },
  buildBoxGradient(colorHex) {
    const c0 = this.hexToRgba(colorHex, 0.04) || "rgba(255,255,255,0.04)"
    const c1 = this.hexToRgba(colorHex, 0.28) || "rgba(255,255,255,0.12)"
    return {
      type: "linear",
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: c0 },
        { offset: 1, color: c1 }
      ],
      global: false
    }
  },
  formatLapClock(seconds, fracDigits) {
    const s0 = Number(seconds)
    if (!Number.isFinite(s0)) return "-"
    const sign = s0 < 0 ? "-" : ""
    const s = Math.abs(s0)
    const m = Math.floor(s / 60)
    const rem = s - m * 60
    const fd = Number.isFinite(Number(fracDigits)) ? Math.max(0, Math.min(3, Number(fracDigits))) : 3
    const remFixed = rem.toFixed(fd)
    const parts = remFixed.split(".")
    const secStr = parts[0] || "0"
    const fracStr = parts[1] || ""
    const sec2 = secStr.padStart(2, "0")
    return fd > 0 ? `${sign}${m}:${sec2}.${fracStr}` : `${sign}${m}:${sec2}`
  },
  parseLapClock(text) {
    const s = String(text || "").trim()
    if (!s) return NaN
    const sign = s.startsWith("-") ? -1 : 1
    const raw = sign < 0 ? s.slice(1) : s
    const parts = raw.split(":")
    if (parts.length === 2) {
      const m = Number(parts[0])
      const sec = Number(parts[1])
      if (Number.isFinite(m) && Number.isFinite(sec)) return sign * (m * 60 + sec)
    }
    const sec = Number(raw)
    return Number.isFinite(sec) ? sign * sec : NaN
  },
  getTelemetryCacheKey(selected) {
    const sessionKey = Number(this.data.sessionKey || 0)
    const nums = (Array.isArray(selected) ? selected : [])
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b)
    return `${sessionKey}|${nums.join(",")}`
  },
  getTelemetryMetricMeta(metric) {
    const dict = i18n.getDict()
    if (metric === "speed") {
      return { label: dict.sessionResults.telemetryMetricSpeed, unit: "km/h", digits: 1 }
    }
    if (metric === "brake") {
      return { label: dict.sessionResults.telemetryMetricBrake, unit: "%", digits: 0 }
    }
    return { label: dict.sessionResults.telemetryMetricThrottle, unit: "%", digits: 0 }
  },
  formatTelemetryMetricValue(metric, value, signed) {
    const n = Number(value)
    if (!Number.isFinite(n)) return "--"
    const meta = this.getTelemetryMetricMeta(metric)
    const digits = meta.digits || 0
    const abs = Math.abs(n)
    const num = digits > 0 ? abs.toFixed(digits) : String(Math.round(abs))
    const sign = signed ? (n > 0 ? "+" : n < 0 ? "-" : "") : ""
    return `${sign}${num} ${meta.unit}`
  },
  averageMetricPairs(pairs, start, end) {
    if (!Array.isArray(pairs) || !pairs.length) return NaN
    let sum = 0
    let count = 0
    const lastEnd = end >= 3
    for (const pair of pairs) {
      const x = pair && pair.length ? Number(pair[0]) : NaN
      const y = pair && pair.length > 1 ? Number(pair[1]) : NaN
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      if (x < start) continue
      if (lastEnd ? x > end : x >= end) continue
      sum += y
      count += 1
    }
    return count ? sum / count : NaN
  },
  buildTelemetryAnalysis(metric, stats) {
    const dict = i18n.getDict()
    const list = Array.isArray(stats) ? stats : []
    const sectorCards = []
    for (let i = 0; i < 3; i++) {
      let leader = null
      for (const it of list) {
        const avg = it && Array.isArray(it.sectorAverages) ? Number(it.sectorAverages[i]) : NaN
        if (!Number.isFinite(avg)) continue
        if (!leader || avg > leader.avg) {
          leader = { avg, label: it.label || "-", color: it.color || "" }
        }
      }
      if (leader) {
        const accentStyle = leader.color
          ? `background:${this.hexToRgba(leader.color, 0.16)}; border-color:${this.hexToRgba(leader.color, 0.22)};`
          : ""
        sectorCards.push({
          sector: `S${i + 1}`,
          label: leader.label,
          metricLabel: dict.sessionResults.telemetrySectorPeak,
          value: this.formatTelemetryMetricValue(metric, leader.avg, false),
          accentStyle
        })
      }
    }
    if (!list.length) {
      return { title: "", text: "", sectorCards }
    }
    const meta = this.getTelemetryMetricMeta(metric)
    if (list.length === 1) {
      const only = list[0]
      let peakIndex = 0
      let peakValue = Number(only.overallAvg)
      for (let i = 0; i < 3; i++) {
        const v = Number(only.sectorAverages[i])
        if (Number.isFinite(v) && (!Number.isFinite(peakValue) || v > peakValue)) {
          peakIndex = i
          peakValue = v
        }
      }
      const text = `${meta.label} ${this.formatTelemetryMetricValue(metric, only.overallAvg, false)} · ${dict.sessionResults.telemetrySectorPeak} S${
        peakIndex + 1
      }`
      return { title: only.label || "", text, sectorCards }
    }
    const a = list[0]
    const b = list[1]
    let maxGapIndex = 0
    let maxGapValue = Number(a.sectorAverages[0]) - Number(b.sectorAverages[0])
    for (let i = 1; i < 3; i++) {
      const diff = Number(a.sectorAverages[i]) - Number(b.sectorAverages[i])
      if (Math.abs(diff) > Math.abs(maxGapValue)) {
        maxGapIndex = i
        maxGapValue = diff
      }
    }
    const overallDiff = Number(a.overallAvg) - Number(b.overallAvg)
    const parts = [
      `${meta.label} ${this.formatTelemetryMetricValue(metric, overallDiff, true)}`,
      `${dict.sessionResults.telemetryLargestGap} S${maxGapIndex + 1} ${this.formatTelemetryMetricValue(metric, maxGapValue, true)}`
    ]
    const lapDelta = Number(a.lapTimeSeconds) - Number(b.lapTimeSeconds)
    if (Number.isFinite(lapDelta)) {
      parts.push(`${dict.sessionResults.telemetryLapDelta} ${this.formatLapClock(lapDelta, 3)}`)
    }
    return {
      title: `${a.label || "-"} vs ${b.label || "-"}`,
      text: parts.join(" · "),
      sectorCards
    }
  },
  syncTelemetryInsights() {
    const key = String(this.data.activeTabKey || "")
    const panel = this._telemetryAnalysisMap && this._telemetryAnalysisMap[key] ? this._telemetryAnalysisMap[key] : null
    this.setData({
      telemetrySectorCards: panel && Array.isArray(panel.sectorCards) ? panel.sectorCards : [],
      telemetryInsightTitle: panel && panel.title ? panel.title : "",
      telemetryInsightText: panel && panel.text ? panel.text : ""
    })
  },
  applyTelemetryRows(rows) {
    const metaByDn = {}
    for (const it of this.data.items || []) {
      const dn = Number(it && it.driver_number)
      if (!dn) continue
      const label = String(it.name_acronym || it.full_name || it.driver_name || dn)
      const color = this.normalizeTeamColor(it.team_color) || "#ffffff"
      metaByDn[dn] = { label, color }
    }
    const toNumOrNull = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const throttleSeries = []
    const brakeSeries = []
    const speedSeries = []
    const lapParts = []
    const lapNumberByDn = {}
    const analysisInput = { throttle: [], brake: [], speed: [] }
    for (const row of rows || []) {
      const dn = row && row.dn ? Number(row.dn) : 0
      const data = row && row.data ? row.data : null
      if (!dn || !data) continue
      const points = Array.isArray(data.points) ? data.points : []
      if (!points.length) continue
      const meta = metaByDn[dn] || { label: String(dn), color: "#ffffff" }
      const baseColor = meta.color || "#ffffff"
      const label = meta.label || String(dn)
      if (data.lap_time) {
        lapParts.push(`${label} ${data.lap_time}`)
      } else {
        lapParts.push(label)
      }
      const ln = Number(data.lap_number || 0)
      if (ln > 0) lapNumberByDn[dn] = ln
      const throttlePts = []
      const brakePts = []
      const speedPts = []
      for (const p of points) {
        const x = toNumOrNull(p && p.x)
        if (x == null) continue
        const th = toNumOrNull(p && p.throttle)
        const br = toNumOrNull(p && p.brake)
        const sp = toNumOrNull(p && p.speed)
        if (th != null) throttlePts.push([x, th])
        if (br != null) brakePts.push([x, br])
        if (sp != null) speedPts.push([x, sp])
      }
      throttleSeries.push({
        name: label,
        type: "line",
        data: throttlePts,
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.5, color: baseColor }
      })
      brakeSeries.push({
        name: label,
        type: "line",
        data: brakePts,
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.5, color: baseColor }
      })
      speedSeries.push({
        name: label,
        type: "line",
        data: speedPts,
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.6, color: baseColor }
      })
      const buildStat = (pairs) => ({
        dn,
        label,
        color: baseColor,
        lapTimeSeconds: this.parseLapClock(data.lap_time),
        sectorAverages: [
          this.averageMetricPairs(pairs, 0, 1),
          this.averageMetricPairs(pairs, 1, 2),
          this.averageMetricPairs(pairs, 2, 3)
        ],
        overallAvg: this.averageMetricPairs(pairs, 0, 3)
      })
      analysisInput.throttle.push(buildStat(throttlePts))
      analysisInput.brake.push(buildStat(brakePts))
      analysisInput.speed.push(buildStat(speedPts))
    }
    this._telemetryLapNumberByDn = lapNumberByDn
    const formatX = (xv) => {
      const x = Number(xv)
      if (!Number.isFinite(x)) return ""
      const sec = x < 1 ? 1 : x < 2 ? 2 : 3
      const pct = Math.round((x - (sec - 1)) * 100)
      return `S${sec} ${Math.max(0, Math.min(100, pct))}%`
    }
    const axisX = {
      type: "value",
      min: 0,
      max: 3,
      axisLabel: {
        color: "rgba(255,255,255,0.55)",
        fontSize: 12,
        formatter: (v) => {
          const x = Number(v)
          if (x === 0) return "S1"
          if (x === 1) return "S2"
          if (x === 2) return "S3"
          return ""
        }
      },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)", width: 1 } },
      axisTick: { show: false },
      splitLine: { show: false }
    }
    const markSectors = {
      silent: true,
      symbol: "none",
      lineStyle: { color: "rgba(255,255,255,0.12)", type: "dashed", width: 1 },
      label: { show: false },
      data: [{ xAxis: 1 }, { xAxis: 2 }]
    }
    const valueAtX = (pairs, x) => {
      if (!Array.isArray(pairs) || !pairs.length || !Number.isFinite(x)) return null
      let l = 0
      let r = pairs.length - 1
      while (l < r) {
        const m = (l + r) >> 1
        const xm = pairs[m] && pairs[m].length ? Number(pairs[m][0]) : NaN
        if (!Number.isFinite(xm)) {
          r = m > 0 ? m - 1 : 0
          continue
        }
        if (xm < x) l = m + 1
        else r = m
      }
      const cand = []
      cand.push(l)
      if (l - 1 >= 0) cand.push(l - 1)
      let bestI = cand[0]
      let bestD = Infinity
      for (const i of cand) {
        const xi = pairs[i] && pairs[i].length ? Number(pairs[i][0]) : NaN
        const yi = pairs[i] && pairs[i].length > 1 ? Number(pairs[i][1]) : NaN
        if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue
        const d = Math.abs(xi - x)
        if (d < bestD) {
          bestD = d
          bestI = i
        }
      }
      const y = pairs[bestI] && pairs[bestI].length > 1 ? Number(pairs[bestI][1]) : NaN
      return Number.isFinite(y) ? y : null
    }
    const buildGridX = (n) => {
      const nn = Number.isFinite(Number(n)) ? Math.max(60, Math.min(600, Math.floor(Number(n)))) : 240
      const out = []
      if (nn <= 1) return [0, 3]
      for (let i = 0; i < nn; i++) {
        const x = (3 * i) / (nn - 1)
        out.push(Math.round(x * 10000) / 10000)
      }
      return out
    }
    const resamplePairs = (pairs, gridX) => {
      const out = []
      for (const x of gridX) {
        out.push([x, valueAtX(pairs, x)])
      }
      return out
    }
    const gridX = buildGridX(240)
    const throttleSeriesAligned = throttleSeries.map((s) => Object.assign({}, s, { data: resamplePairs(s.data, gridX) }))
    const brakeSeriesAligned = brakeSeries.map((s) => Object.assign({}, s, { data: resamplePairs(s.data, gridX) }))
    const speedSeriesAligned = speedSeries.map((s) => Object.assign({}, s, { data: resamplePairs(s.data, gridX) }))
    const buildOptionPct = (series) => {
      if (!series.length) return null
      return {
        backgroundColor: "#000000",
        grid: { left: 18, right: 18, top: 52, bottom: 22, containLabel: true },
        tooltip: {
          trigger: "axis",
          confine: true,
          backgroundColor: "rgba(0,0,0,0.85)",
          borderWidth: 0,
          textStyle: { color: "#fff", fontSize: 12, lineHeight: 18 },
          formatter: (params) => {
            const arr = Array.isArray(params) ? params : []
            const p0 = arr[0] || null
            const xv0 = p0 && p0.axisValue != null ? Number(p0.axisValue) : p0 && Array.isArray(p0.value) ? Number(p0.value[0]) : NaN
            const header = formatX(xv0)
            const lines = header ? [header] : []
            for (const p of arr) {
              const raw = p && Array.isArray(p.data) ? p.data[1] : p && p.value != null && Array.isArray(p.value) ? p.value[1] : null
              const yv = raw != null ? Number(raw) : NaN
              const val = Number.isFinite(yv) ? `${Math.round(yv)}%` : "N/A"
              lines.push(`${p && p.marker ? p.marker : ""} ${p && p.seriesName ? p.seriesName : ""}: ${val}`.trim())
            }
            return lines.join("\n")
          }
        },
        legend: { show: false, type: "scroll", top: 8, textStyle: { color: "rgba(255,255,255,0.7)" } },
        xAxis: axisX,
        yAxis: {
          type: "value",
          min: 0,
          max: 100,
          name: "%",
          nameTextStyle: { color: "rgba(255,255,255,0.42)", padding: [0, 0, 0, -4], fontSize: 11 },
          axisLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)", width: 1 } },
          minorTick: { show: true, splitNumber: 2, lineStyle: { color: "rgba(255,255,255,0.06)", width: 1 } },
          minorSplitLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.04)", width: 1 } },
          axisLine: { show: false }
        },
        series: series.map((s) => Object.assign({}, s, { markLine: markSectors }))
      }
    }
    const optionThrottle = buildOptionPct(throttleSeriesAligned)
    const optionBrake = buildOptionPct(brakeSeriesAligned)
    const optionSpeed =
      speedSeriesAligned.length === 0
        ? null
        : {
            backgroundColor: "#000000",
            grid: { left: 18, right: 18, top: 52, bottom: 22, containLabel: true },
            tooltip: {
              trigger: "axis",
              confine: true,
              backgroundColor: "rgba(0,0,0,0.85)",
              borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12, lineHeight: 18 },
              formatter: (params) => {
                const arr = Array.isArray(params) ? params : []
                const p0 = arr[0] || null
                const xv0 = p0 && p0.axisValue != null ? Number(p0.axisValue) : p0 && Array.isArray(p0.value) ? Number(p0.value[0]) : NaN
                const header = formatX(xv0)
                const lines = header ? [header] : []
                for (const p of arr) {
                  const raw = p && Array.isArray(p.data) ? p.data[1] : p && p.value != null && Array.isArray(p.value) ? p.value[1] : null
                  const yv = raw != null ? Number(raw) : NaN
                  const val = Number.isFinite(yv) ? `${Math.round(yv)} km/h` : "N/A"
                  lines.push(`${p && p.marker ? p.marker : ""} ${p && p.seriesName ? p.seriesName : ""}: ${val}`.trim())
                }
                return lines.join("\n")
              }
            },
            legend: { show: false, type: "scroll", top: 8, textStyle: { color: "rgba(255,255,255,0.7)" } },
            xAxis: axisX,
            yAxis: {
              type: "value",
              name: "km/h",
              nameTextStyle: { color: "rgba(255,255,255,0.42)", padding: [0, 0, 0, -2], fontSize: 11 },
              axisLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
              splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)", width: 1 } },
              minorTick: { show: true, splitNumber: 2, lineStyle: { color: "rgba(255,255,255,0.06)", width: 1 } },
              minorSplitLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.04)", width: 1 } },
              axisLine: { show: false }
            },
            series: speedSeriesAligned.map((s) => Object.assign({}, s, { markLine: markSectors }))
          }
    this._telemetryAnalysisMap = {
      throttle: this.buildTelemetryAnalysis("throttle", analysisInput.throttle),
      brake: this.buildTelemetryAnalysis("brake", analysisInput.brake),
      speed: this.buildTelemetryAnalysis("speed", analysisInput.speed)
    }
    const dict = i18n.getDict()
    const telemetryLapInfo = lapParts.length ? `${dict.sessionResults.fastestLap}：${lapParts.join(" / ")}` : dict.sessionResults.fastestLapCompare
    this.setData(
      {
        chartOptionThrottle: optionThrottle,
        chartOptionBrake: optionBrake,
        chartOptionSpeed: optionSpeed,
        telemetryPanels: this._telemetryAnalysisMap || {},
        telemetryLapInfo
      },
      () => {
        this.syncTelemetryOption()
        this.syncTelemetryInsights()
        this.scheduleActivePanelMeasure()
      }
    )
  },
  clearTelemetryState() {
    this._telemetryAnalysisMap = null
    this.setData({
      chartOptionThrottle: null,
      chartOptionBrake: null,
      chartOptionSpeed: null,
      chartOptionTelemetry: null,
      telemetryPanels: {},
      telemetryLapInfo: "",
      telemetrySectorCards: [],
      telemetryInsightTitle: "",
      telemetryInsightText: ""
    }, () => this.scheduleActivePanelMeasure())
  },
  onLoad(options) {
    this._telemetryCache = Object.create(null)
    this._telemetryAnalysisMap = null
    this._boxplotRowsNormalized = null
    this._chartGuideSeen = this.loadChartGuideSeenState()
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    const raceName = decodeURIComponent(options.raceName || "")
    const sessionCode = decodeURIComponent(options.sessionCode || "")
    const sessionName = decodeURIComponent(options.sessionName || "")
    const sessionKey = Number(options.sessionKey || 0)
    const tabs = this.buildTabs(sessionCode, sessionName)
    const activeTabKey = (tabs && tabs[0] && tabs[0].key) || "rank"
    const tabSwiperCurrent = Math.max(0, tabs.findIndex((t) => t && t.key === activeTabKey))
    this.setData({ raceName, sessionName, sessionCode, sessionKey, tabs, activeTabKey, tabSwiperCurrent }, () => {
      this.applyI18n()
      this.refreshChartGuide(activeTabKey)
      this.scheduleTabIndicatorUpdate(true)
      this.scheduleActivePanelMeasure()
      if (sessionName) {
        wx.setNavigationBarTitle({ title: sessionName })
      }
      this.loadResults()
    })
  },
  onUnload() {
    if (this._tabIndicatorTimer) {
      clearTimeout(this._tabIndicatorTimer)
      this._tabIndicatorTimer = null
    }
    if (this._panelMeasureTimer) {
      clearTimeout(this._panelMeasureTimer)
      this._panelMeasureTimer = null
    }
    if (this._tabTransitionTimer) {
      clearTimeout(this._tabTransitionTimer)
      this._tabTransitionTimer = null
    }
    if (this._telemetryDragResetTimer) {
      clearTimeout(this._telemetryDragResetTimer)
      this._telemetryDragResetTimer = null
    }
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n()
    this.scheduleTabIndicatorUpdate(true)
    this.scheduleActivePanelMeasure()
    if (this.data.activeTabKey === "boxplot") {
      this.updateBoxplotHeight()
      return
    }
    if (this.data.activeTabKey === "throttle" || this.data.activeTabKey === "brake" || this.data.activeTabKey === "speed") {
      this.updateTelemetryHeight()
    }
  },
  onPullDownRefresh() {
    if (this.data.activeTabKey === "boxplot") {
      this.loadBoxplot({ isPullDown: true })
      return
    }
    if (this.data.activeTabKey === "throttle" || this.data.activeTabKey === "brake" || this.data.activeTabKey === "speed") {
      this.loadTelemetry({ isPullDown: true, force: true })
      return
    }
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
      header: { "Accept-Language": i18n.getLocale() },
      success: (res) => {
        const data = (res && res.data) || {}
        const items = Array.isArray(data.items) ? data.items : []
        this._telemetryCache = Object.create(null)
        this._telemetryAnalysisMap = null
        const mapped = items.map((it) => {
          const c = (it && it.team_color) || ""
          const cardStyle = c ? `box-shadow: inset 6rpx 0 0 ${c};` : ""
          return Object.assign({}, it, { cardStyle })
        })
        const selected = this.hasTab("boxplot") ? this.selectDefaultDrivers(mapped, this.data.selectedDriverNumbers) : []
        const telemetrySelected =
          this.hasTab("throttle") || this.hasTab("brake") || this.hasTab("speed")
            ? this.selectDefaultDrivers(mapped, this.data.telemetryDriverNumbers)
            : []
        this.setData(
          {
            items: mapped,
            selectedDriverNumbers: selected,
            selectedDriverText: this.buildSelectedText(mapped, selected),
            telemetryDriverNumbers: telemetrySelected,
            telemetrySelectedText: this.buildSelectedText(mapped, telemetrySelected)
          },
          () => {
            this.scheduleActivePanelMeasure()
            if (this.data.activeTabKey === "boxplot") {
              this.loadBoxplot()
              return
            }
            if (this.data.activeTabKey === "throttle" || this.data.activeTabKey === "brake" || this.data.activeTabKey === "speed") {
              this.loadTelemetry()
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
  selectDefaultDrivers(items, current) {
    const cur = Array.isArray(current) ? current.filter((x) => Number(x) > 0) : []
    if (cur.length) return cur
    const out = []
    for (const it of items || []) {
      const dn = Number(it && it.driver_number)
      if (!dn) continue
      out.push(dn)
      if (out.length >= 3) break
    }
    return out
  },
  buildSelectedText(items, selected) {
    const byDn = {}
    for (const it of items || []) {
      const dn = Number(it && it.driver_number)
      if (!dn) continue
      const acr = (it && it.name_acronym) || ""
      byDn[dn] = String(acr || dn)
    }
    const labels = (selected || []).map((dn) => byDn[dn] || String(dn))
    const dict = i18n.getDict()
    return labels.length ? `${dict.sessionResults.comparePrefix}${labels.join(" / ")}` : dict.sessionResults.pickDriver
  },
  switchToTab(key, opts) {
    const nextKey = String(key || "")
    if (!nextKey || nextKey === this.data.activeTabKey) return false
    const nextIndex = this.getTabIndex(nextKey)
    const updates = { activeTabKey: nextKey }
    if (nextIndex >= 0) updates.tabSwiperCurrent = nextIndex
    this.setData(updates, () => this.applyActiveTabState(nextKey))
    return true
  },
  switchTabByOffset(offset) {
    const step = Number(offset)
    if (!Number.isFinite(step) || !step) return false
    const tabs = Array.isArray(this.data.tabs) ? this.data.tabs : []
    if (tabs.length < 2) return false
    const cur = String(this.data.activeTabKey || "")
    const index = tabs.findIndex((tab) => tab && tab.key === cur)
    if (index < 0) return false
    const next = tabs[index + step]
    if (!next || !next.key) return false
    return this.switchToTab(next.key, { direction: step })
  },
  onTabTap(e) {
    const key = String((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || "")
    this.switchToTab(key)
  },
  onSwiperChange(e) {
    const idx = Number((e && e.detail && e.detail.current) || 0)
    const tabs = Array.isArray(this.data.tabs) ? this.data.tabs : []
    const next = tabs[idx]
    if (!next || !next.key) return
    if (idx === this.data.tabSwiperCurrent && next.key === this.data.activeTabKey) {
      this.scheduleActivePanelMeasure()
      return
    }
    this.setData({ tabSwiperCurrent: idx, activeTabKey: next.key }, () => this.applyActiveTabState(next.key))
  },
  onSwiperAnimationFinish() {
    this.scheduleActivePanelMeasure()
  },
  onChartTouchStart(e) {
    if (this.data.showPicker) return
    const touch = e && e.changedTouches && e.changedTouches[0]
    if (!touch) return
    this._chartTouchStart = { x: Number(touch.clientX) || 0, y: Number(touch.clientY) || 0 }
    if (this._telemetryDragResetTimer) {
      clearTimeout(this._telemetryDragResetTimer)
      this._telemetryDragResetTimer = null
    }
    if (this.isTelemetryTab(this.data.activeTabKey) && this.data.telemetryDragStyle) {
      this.setData({ telemetryDragStyle: "" })
    }
  },
  onChartTouchMove(e) {
    if (this.data.showPicker || !this._chartTouchStart) return
    const touch = e && e.changedTouches && e.changedTouches[0]
    if (!touch) return
    const dxRaw = (Number(touch.clientX) || 0) - this._chartTouchStart.x
    const dyRaw = (Number(touch.clientY) || 0) - this._chartTouchStart.y
    if (!this.isTelemetryTab(this.data.activeTabKey)) return
    if (Math.abs(dyRaw) > SWIPE_MAX_VERTICAL_DELTA_PX && Math.abs(dyRaw) > Math.abs(dxRaw)) {
      this.resetTelemetryDrag(false)
      return
    }
    const cur = String(this.data.activeTabKey || "")
    const leftAvailable = this.canSwipeTelemetry(-1)
    const rightAvailable = this.canSwipeTelemetry(1)
    let drag = dxRaw * TELEMETRY_DRAG_RESISTANCE
    if ((drag > 0 && !leftAvailable) || (drag < 0 && !rightAvailable)) {
      drag *= 0.45
    }
    const clamped = Math.max(-TELEMETRY_DRAG_MAX_PX, Math.min(TELEMETRY_DRAG_MAX_PX, drag))
    const opacity = 1 - Math.min(0.08, Math.abs(clamped) / 420)
    this.setData({ telemetryDragStyle: `transform: translate3d(${clamped.toFixed(1)}px, 0, 0); opacity:${opacity.toFixed(3)};` })
    this.updateTelemetryEdgeStyles(clamped)
  },
  onChartTouchEnd(e) {
    if (this.data.showPicker || !this._chartTouchStart) return
    const touch = e && e.changedTouches && e.changedTouches[0]
    const start = this._chartTouchStart
    this._chartTouchStart = null
    if (!touch) return
    const dx = (Number(touch.clientX) || 0) - start.x
    const dy = (Number(touch.clientY) || 0) - start.y
    const currentKey = String(this.data.activeTabKey || "")
    const telemetryTab = this.isTelemetryTab(currentKey)
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dy) > SWIPE_MAX_VERTICAL_DELTA_PX) {
      if (telemetryTab) this.resetTelemetryDrag(true)
      return
    }
    const switched = telemetryTab
      ? dx < 0
        ? this.switchTelemetryTabByOffset(1)
        : this.switchTelemetryTabByOffset(-1)
      : dx < 0
        ? this.switchTabByOffset(1)
        : this.switchTabByOffset(-1)
    if (telemetryTab) this.resetTelemetryDrag(true)
    if (switched) {
      this.markChartGuideSeen(currentKey)
    }
  },
  onOpenPicker() {
    if (!this.ensureLoggedIn()) return
    const picked = Array.isArray(this.data.selectedDriverNumbers) ? this.data.selectedDriverNumbers.slice() : []
    const pickedMap = {}
    for (const dn of picked) pickedMap[dn] = true
    this.setData({ showPicker: true, pickerMode: "boxplot", pickedDriverNumbers: picked, pickedMap })
  },
  onOpenTelemetryPicker() {
    if (!this.ensureLoggedIn()) return
    const picked = Array.isArray(this.data.telemetryDriverNumbers) ? this.data.telemetryDriverNumbers.slice() : []
    const pickedMap = {}
    for (const x of picked) pickedMap[x] = true
    this.setData({ showPicker: true, pickerMode: "telemetry", pickedDriverNumbers: picked, pickedMap })
  },
  onClosePicker() {
    this.setData({ showPicker: false, pickerMode: "" })
  },
  onPickerCancel() {
    this.setData({ showPicker: false, pickerMode: "" })
  },
  onPickerConfirm() {
    const picked = Array.isArray(this.data.pickedDriverNumbers) ? this.data.pickedDriverNumbers.slice() : []
    if (this.data.pickerMode === "telemetry") {
      this.setData(
        {
          showPicker: false,
          pickerMode: "",
          telemetryDriverNumbers: picked,
          telemetrySelectedText: this.buildSelectedText(this.data.items, picked)
        },
        () => this.loadTelemetry()
      )
      return
    }
    this.setData(
      {
        showPicker: false,
        pickerMode: "",
        selectedDriverNumbers: picked,
        selectedDriverText: this.buildSelectedText(this.data.items, picked)
      },
      () => this.loadBoxplot()
    )
  },
  updateBoxplotHeight() {
    try {
      const sys = wx.getSystemInfoSync()
      const winW = Number(sys.windowWidth) || 375
      const safeBottom = sys.safeArea && sys.safeArea.bottom ? Number(sys.safeArea.bottom) : Number(sys.windowHeight) || 700
      const query = wx.createSelectorQuery().in(this)
      query
        .select(".boxplot-chart")
        .boundingClientRect((rect) => {
          if (!rect || !Number.isFinite(rect.top)) return
          const remainPx = safeBottom - Number(rect.top) - 16
          if (!(remainPx > 200)) return
          const rpx = Math.max(420, Math.min(1100, Math.floor((remainPx * 750) / winW)))
          if (rpx !== this.data.boxplotHeightRpx) {
            this.setData({ boxplotHeightRpx: rpx })
          }
        })
        .exec()
    } catch (e) {}
  },
  onTogglePickDriver(e) {
    const dn = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.driverNumber) || 0)
    if (!dn) return
    let cur = Array.isArray(this.data.pickedDriverNumbers) ? this.data.pickedDriverNumbers.slice() : []
    const i = cur.indexOf(dn)
    if (i >= 0) cur.splice(i, 1)
    else cur.push(dn)
    cur.sort((a, b) => a - b)
    const pickedMap = {}
    for (const v of cur) pickedMap[v] = true
    this.setData({ pickedDriverNumbers: cur, pickedMap })
  },
  updateTelemetryHeight() {
    try {
      const sys = wx.getSystemInfoSync()
      const winW = Number(sys.windowWidth) || 375
      const safeBottom = sys.safeArea && sys.safeArea.bottom ? Number(sys.safeArea.bottom) : Number(sys.windowHeight) || 700
      const query = wx.createSelectorQuery().in(this)
      query
        .select(".telemetry-chart")
        .boundingClientRect((rect) => {
          if (!rect || !Number.isFinite(rect.top)) return
          const remainPx = safeBottom - Number(rect.top) - 16
          if (!(remainPx > 200)) return
          const rpx = Math.max(420, Math.min(1100, Math.floor((remainPx * 750) / winW)))
          if (rpx !== this.data.telemetryHeightRpx) {
            this.setData({ telemetryHeightRpx: rpx })
          }
        })
        .exec()
    } catch (e) {}
  },
  loadTelemetry(opts) {
    const done = () => {
      if (opts && opts.isPullDown) {
        wx.stopPullDownRefresh()
      }
    }
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    const sessionKey = Number(this.data.sessionKey || 0)
    const selected = Array.isArray(this.data.telemetryDriverNumbers) ? this.data.telemetryDriverNumbers.filter((x) => Number(x) > 0) : []
    if (!apiBase || !sessionKey || !selected.length) {
      this.clearTelemetryState()
      done()
      return
    }
    const cacheKey = this.getTelemetryCacheKey(selected)
    if (!opts || !opts.force) {
      const cached = this._telemetryCache && this._telemetryCache[cacheKey]
      if (cached) {
        this.applyTelemetryRows(cached)
        done()
        return
      }
    }
    const fetchOne = (driverNumber) => {
      const dn = Number(driverNumber)
      const url = `${apiBase.replace(/\/+$/, "")}/api/v1/mp/telemetry/sector_controls?session_key=${sessionKey}&driver_number=${dn}&max_points=900`
      return new Promise((resolve) => {
        wx.request({
          url,
          method: "GET",
          success: (res) => resolve({ dn, data: (res && res.data) || {} }),
          fail: () => resolve({ dn, data: null })
        })
      })
    }

    Promise.all(selected.map((dn) => fetchOne(dn)))
      .then((rows) => {
        if (!this._telemetryCache) this._telemetryCache = Object.create(null)
        this._telemetryCache[cacheKey] = rows
        this.applyTelemetryRows(rows)
        done()
      })
      .catch(() => {
        this.clearTelemetryState()
        done()
      })
  },
  onCopyTelemetryLink() {
    const sessionKey = Number(this.data.sessionKey || 0)
    const picked = Array.isArray(this.data.telemetryDriverNumbers) ? this.data.telemetryDriverNumbers.filter((x) => Number(x) > 0) : []
    if (!sessionKey || !picked.length) {
      wx.showToast({ title: i18n.t("common.noLinkToCopy"), icon: "none" })
      return
    }
    const tab = String(this.data.activeTabKey || "")
    const page =
      tab === "throttle"
        ? "compare-throttle"
        : tab === "brake"
          ? "compare-brake"
          : tab === "speed"
            ? "compare-speed"
            : "compare-throttle"
    let url = ""
    try {
      url = buildChartsShareUrl({
        page,
        session_key: sessionKey,
        driver_numbers: picked
      })
    } catch (e) {
      wx.showToast({ title: i18n.t("common.copyFailed"), icon: "none" })
      return
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: i18n.t("common.copied"), icon: "success" })
      },
      fail: () => {
        wx.showToast({ title: i18n.t("common.copyFailed"), icon: "none" })
      }
    })
  },
  onCopyBoxplotLink() {
    const sessionKey = Number(this.data.sessionKey || 0)
    const selected = Array.isArray(this.data.selectedDriverNumbers) ? this.data.selectedDriverNumbers.filter((x) => Number(x) > 0) : []
    if (!sessionKey || !selected.length) {
      wx.showToast({ title: i18n.t("common.noLinkToCopy"), icon: "none" })
      return
    }
    let url = ""
    try {
      url = buildChartsShareUrl({
        page: "boxplot",
        session_key: sessionKey,
        driver_numbers: selected,
        include_pit_out: 0
      })
    } catch (e) {
      wx.showToast({ title: i18n.t("common.copyFailed"), icon: "none" })
      return
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: i18n.t("common.copied"), icon: "success" })
      },
      fail: () => {
        wx.showToast({ title: i18n.t("common.copyFailed"), icon: "none" })
      }
    })
  },
  loadBoxplot(opts) {
    const done = () => {
      if (opts && opts.isPullDown) {
        wx.stopPullDownRefresh()
      }
    }
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    const sessionKey = Number(this.data.sessionKey || 0)
    const selected = Array.isArray(this.data.selectedDriverNumbers) ? this.data.selectedDriverNumbers : []
    if (!apiBase || !sessionKey || !selected.length) {
      this._boxplotRowsNormalized = null
      this.setData({ chartOptionBoxplot: null, boxplotSummaryCards: [], boxplotHintText: "" })
      done()
      return
    }
    const driverNumbers = selected.join(",")
    const url = `${apiBase.replace(/\/+$/, "")}/api/v1/telemetry/lap_time_boxplot?session_key=${sessionKey}&driver_numbers=${encodeURIComponent(
      driverNumbers
    )}&exclude_flags=1`
    wx.request({
      url,
      method: "GET",
      success: (res) => {
        const data = (res && res.data) || {}
        const items = Array.isArray(data.items) ? data.items : []
        const normalized = this.normalizeBoxplotRows(items)
        this._boxplotRowsNormalized = normalized
        const opt = this.buildBoxplotOption(normalized)
        const boxplotSummaryCards = this.buildBoxplotSummaryCards(normalized)
        const boxplotHintText = i18n.getDict().sessionResults.boxplotSummaryDesc
        this.setData({ chartOptionBoxplot: opt, boxplotSummaryCards, boxplotHintText }, () => this.scheduleActivePanelMeasure())
        done()
      },
      fail: () => {
        done()
      }
    })
  },
  normalizeBoxplotRows(items) {
    const rows = Array.isArray(items) ? items : []
    return rows
      .map((it) => {
        const wl = Number(it && it.whisker_low)
        const q1 = Number(it && it.q1)
        const med = Number(it && it.median)
        const q3 = Number(it && it.q3)
        const wh = Number(it && it.whisker_high)
        if (![wl, q1, med, q3, wh].every((v) => Number.isFinite(v))) return null
        const color = this.normalizeTeamColor(it && it.team_colour) || "#ffffff"
        return {
          raw: it || {},
          label: String((it && (it.name_acronym || it.driver_number)) || ""),
          color,
          whiskerLow: wl,
          q1,
          median: med,
          q3,
          whiskerHigh: wh,
          iqr: q3 - q1,
          spread: wh - wl
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.median !== b.median) return a.median - b.median
        if (a.iqr !== b.iqr) return a.iqr - b.iqr
        return String(a.label).localeCompare(String(b.label))
      })
  },
  buildBoxplotSummaryCards(rows) {
    const list = Array.isArray(rows) ? rows : []
    if (!list.length) return []
    const dict = i18n.getDict()
    const fastest = list[0]
    let stable = list[0]
    let widest = list[0]
    for (const row of list) {
      if (row.iqr < stable.iqr) stable = row
      if (row.spread > widest.spread) widest = row
    }
    const makeStyle = (color) =>
      color ? `background:${this.hexToRgba(color, 0.14)}; border-color:${this.hexToRgba(color, 0.2)};` : ""
    return [
      {
        key: "pace",
        title: dict.sessionResults.boxplotFastestPace,
        name: fastest.label || "-",
        value: this.formatLapClock(fastest.median, 3),
        note: dict.sessionResults.boxplotMedianPace,
        accentStyle: makeStyle(fastest.color)
      },
      {
        key: "stable",
        title: dict.sessionResults.boxplotMostStable,
        name: stable.label || "-",
        value: this.formatLapClock(stable.iqr, 3),
        note: dict.sessionResults.boxplotTypicalRange,
        accentStyle: makeStyle(stable.color)
      },
      {
        key: "spread",
        title: dict.sessionResults.boxplotLargestSpread,
        name: widest.label || "-",
        value: this.formatLapClock(widest.spread, 3),
        note: dict.sessionResults.boxplotOverallSpread,
        accentStyle: makeStyle(widest.color)
      }
    ]
  },
  buildBoxplotOption(items) {
    const rows = Array.isArray(items) ? items : this.normalizeBoxplotRows(items)
    const cats = []
    const data = []
    let lo = null
    let hi = null
    let fastest = null
    for (let i = 0; i < rows.length; i++) {
      const it = rows[i] || {}
      const label = String(it.label || "")
      const wl = Number(it.whiskerLow)
      const q1 = Number(it.q1)
      const med = Number(it.median)
      const q3 = Number(it.q3)
      const wh = Number(it.whiskerHigh)
      lo = lo == null ? wl : Math.min(lo, wl)
      hi = hi == null ? wh : Math.max(hi, wh)
      fastest = fastest == null ? wl : Math.min(fastest, wl)
      const color = it.color || "#ffffff"
      const fill = this.buildBoxGradient(color)
      const shadowColor = this.hexToRgba(color, 0.35) || "rgba(255,255,255,0.18)"
      const xIndex = data.length
      cats.push(label || String(xIndex + 1))
      data.push({
        value: [wl, q1, med, q3, wh],
        itemStyle: { color: fill, borderColor: color, borderWidth: 1, shadowBlur: 6, shadowOffsetY: 2, shadowColor }
      })
    }
    const y = {}
    if (lo != null && hi != null && hi > lo) {
      const range = hi - lo
      const pad = range / 2
      y.min = Math.floor((lo - pad) * 1000) / 1000
      y.max = Math.ceil((hi + pad) * 1000) / 1000
    }
    const markLine =
      fastest != null && Number.isFinite(fastest)
        ? {
            silent: true,
            symbol: "none",
            lineStyle: { color: "rgba(255,255,255,0.45)", width: 1, type: "dashed" },
            label: { show: false },
            data: [{ yAxis: fastest }]
          }
        : undefined
    return {
      backgroundColor: "#000000",
      textStyle: { color: "rgba(255,255,255,0.82)" },
      grid: { left: 60, right: 24, top: 24, bottom: 60 },
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(0,0,0,0.85)",
        borderWidth: 0,
        textStyle: { color: "#fff" },
        formatter: (p) => {
          const raw =
            (p && Array.isArray(p.value) && p.value) ||
            (p && p.data && (Array.isArray(p.data) ? p.data : p.data.value)) ||
            null
          if (!Array.isArray(raw)) return ""
          const v = raw.length >= 6 ? raw.slice(raw.length - 5) : raw
          if (v.length < 5) return ""
          const wl = this.formatLapClock(v[0], 3)
          const q1 = this.formatLapClock(v[1], 3)
          const med = this.formatLapClock(v[2], 3)
          const q3 = this.formatLapClock(v[3], 3)
          const wh = this.formatLapClock(v[4], 3)
          const dict = i18n.getDict()
          return `${p.name}\n${dict.sessionResults.boxplotPaceFloor}=${wl}\n${dict.sessionResults.boxplotMedianPace}=${med}\n${dict.sessionResults.boxplotTypicalRange}=${q1} - ${q3}\n${dict.sessionResults.boxplotOverallSpread}=${wl} - ${wh}`
        }
      },
      xAxis: {
        type: "category",
        data: cats,
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.25)", width: 1 } },
        axisTick: { show: false },
        axisLabel: { color: "rgba(255,255,255,0.72)", fontSize: 12 }
      },
      yAxis: Object.assign(
        {
          type: "value",
          axisLine: { show: false },
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)", width: 1 } },
          minorTick: { show: true, splitNumber: 2, lineStyle: { color: "rgba(255,255,255,0.06)", width: 1 } },
          minorSplitLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.04)", width: 1 } },
          axisLabel: {
            color: "rgba(255,255,255,0.72)",
            fontSize: 12,
            formatter: (v) => {
              const vv = Number(v)
              if (!Number.isFinite(vv)) return ""
              if (y && Number.isFinite(y.min) && vv <= Number(y.min)) return ""
              if (y && Number.isFinite(y.max) && vv >= Number(y.max)) return ""
              return this.formatLapClock(vv, 1)
            }
          }
        },
        y
      ),
      series: [
        {
          name: "lap_time_boxplot",
          type: "boxplot",
          data,
          boxWidth: [4, 14],
          markLine
        }
      ]
    }
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
  },
  applyI18n() {
    const dict = i18n.getDict()
    const tabs = this.buildTabs(this.data.sessionCode, this.data.sessionName)
    const cur = String(this.data.activeTabKey || "")
    const hasCur = (tabs || []).some((t) => t && t.key === cur)
    const activeTabKey = hasCur ? cur : (tabs[0] && tabs[0].key) || "rank"
    const tabSwiperCurrent = Math.max(0, tabs.findIndex((t) => t && t.key === activeTabKey))
    const selectedDriverText = this.buildSelectedText(this.data.items, this.data.selectedDriverNumbers)
    const telemetrySelectedText = this.buildSelectedText(this.data.items, this.data.telemetryDriverNumbers)
    const guideMeta = this.getChartGuideMeta(activeTabKey)
    const updates = {
      i18n: dict,
      tabs,
      activeTabKey,
      tabSwiperCurrent,
      selectedDriverText,
      telemetrySelectedText,
      boxplotHintText: dict.sessionResults.boxplotSummaryDesc,
      chartGuideTitle: guideMeta ? guideMeta.title : "",
      chartGuideText: guideMeta ? guideMeta.text : "",
      chartGuideVisible: guideMeta ? this._chartGuideSeen[guideMeta.category] !== "1" : false
    }
    if (this._boxplotRowsNormalized && this._boxplotRowsNormalized.length) {
      updates.chartOptionBoxplot = this.buildBoxplotOption(this._boxplotRowsNormalized)
      updates.boxplotSummaryCards = this.buildBoxplotSummaryCards(this._boxplotRowsNormalized)
    }
    this.setData(updates)
    this.scheduleTabIndicatorUpdate(true)
    this.scheduleActivePanelMeasure()
    if (this.data.chartOptionThrottle || this.data.chartOptionBrake || this.data.chartOptionSpeed) {
      this.loadTelemetry()
    }
    const ssn = String(this.data.sessionName || "").trim()
    if (ssn) wx.setNavigationBarTitle({ title: ssn })
  }
})
