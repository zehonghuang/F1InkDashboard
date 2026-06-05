const { buildChartsShareUrl } = require("../../services/chartsShare")
const { getAuthState } = require("../../services/authService")
const i18n = require("../../services/i18n")

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
    showPicker: false,
    pickerMode: "",
    pickedDriverNumbers: [],
    pickedMap: {}
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
  onLoad(options) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    const raceName = decodeURIComponent(options.raceName || "")
    const sessionCode = decodeURIComponent(options.sessionCode || "")
    const sessionName = decodeURIComponent(options.sessionName || "")
    const sessionKey = Number(options.sessionKey || 0)
    const tabs = this.buildTabs(sessionCode, sessionName)
    const activeTabKey = (tabs && tabs[0] && tabs[0].key) || "rank"
    this.setData({ raceName, sessionName, sessionCode, sessionKey, tabs, activeTabKey }, () => {
      this.applyI18n()
      if (sessionName) {
        wx.setNavigationBarTitle({ title: sessionName })
      }
      this.loadResults()
    })
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n()
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
      this.loadTelemetry({ isPullDown: true })
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
      success: (res) => {
        const data = (res && res.data) || {}
        const items = Array.isArray(data.items) ? data.items : []
        const mapped = items.map((it) => {
          const c = (it && it.team_color) || ""
          const cardStyle = c ? `border-left: 10rpx solid ${c}; padding-left: 16rpx;` : ""
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
  onTabTap(e) {
    const key = String((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || "")
    if (!key || key === this.data.activeTabKey) return
    this.setData({ activeTabKey: key }, () => {
      if (key === "boxplot") {
        this.updateBoxplotHeight()
        this.loadBoxplot()
        return
      }
      if (key === "throttle" || key === "brake" || key === "speed") {
        this.updateTelemetryHeight()
        this.loadTelemetry()
        this.syncTelemetryOption()
      }
    })
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
      this.setData({ chartOptionThrottle: null, chartOptionBrake: null, chartOptionSpeed: null, telemetryLapInfo: "" })
      done()
      return
    }
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
        const throttleSeries = []
        const brakeSeries = []
        const speedSeries = []
        const lapParts = []
        const lapNumberByDn = {}

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
            legend: { type: "scroll", top: 8, textStyle: { color: "rgba(255,255,255,0.7)" } },
            xAxis: axisX,
            yAxis: {
              type: "value",
              min: 0,
              max: 100,
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
                legend: { type: "scroll", top: 8, textStyle: { color: "rgba(255,255,255,0.7)" } },
                xAxis: axisX,
                yAxis: {
                  type: "value",
                  axisLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
                  splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)", width: 1 } },
                  minorTick: { show: true, splitNumber: 2, lineStyle: { color: "rgba(255,255,255,0.06)", width: 1 } },
                  minorSplitLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.04)", width: 1 } },
                  axisLine: { show: false }
                },
                series: speedSeriesAligned.map((s) => Object.assign({}, s, { markLine: markSectors }))
              }

        const dict = i18n.getDict()
        const telemetryLapInfo = lapParts.length
          ? `${dict.sessionResults.fastestLap}：${lapParts.join(" / ")}`
          : dict.sessionResults.fastestLapCompare
        this.setData(
          { chartOptionThrottle: optionThrottle, chartOptionBrake: optionBrake, chartOptionSpeed: optionSpeed, telemetryLapInfo },
          () => this.syncTelemetryOption()
        )
        done()
      })
      .catch(() => {
        this.setData({ chartOptionThrottle: null, chartOptionBrake: null, chartOptionSpeed: null, chartOptionTelemetry: null, telemetryLapInfo: "" })
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
      this.setData({ chartOptionBoxplot: null })
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
        const opt = this.buildBoxplotOption(items)
        this.setData({ chartOptionBoxplot: opt })
        done()
      },
      fail: () => {
        done()
      }
    })
  },
  buildBoxplotOption(items) {
    const rows = Array.isArray(items) ? items : []
    const cats = []
    const data = []
    let lo = null
    let hi = null
    let fastest = null
    for (let i = 0; i < rows.length; i++) {
      const it = rows[i] || {}
      const label = String(it.name_acronym || it.driver_number || "")
      const wl = Number(it.whisker_low)
      const q1 = Number(it.q1)
      const med = Number(it.median)
      const q3 = Number(it.q3)
      const wh = Number(it.whisker_high)
      if (![wl, q1, med, q3, wh].every((v) => Number.isFinite(v))) continue
      lo = lo == null ? wl : Math.min(lo, wl)
      hi = hi == null ? wh : Math.max(hi, wh)
      fastest = fastest == null ? wl : Math.min(fastest, wl)
      const color = this.normalizeTeamColor(it.team_colour) || "#ffffff"
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
          return `${p.name}\n${dict.sessionResults.boxLowerWhisker}=${wl}\n${dict.sessionResults.boxQ1}=${q1}\n${dict.sessionResults.boxMedian}=${med}\n${dict.sessionResults.boxQ3}=${q3}\n${dict.sessionResults.boxUpperWhisker}=${wh}`
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
    const selectedDriverText = this.buildSelectedText(this.data.items, this.data.selectedDriverNumbers)
    const telemetrySelectedText = this.buildSelectedText(this.data.items, this.data.telemetryDriverNumbers)
    this.setData({ i18n: dict, tabs, activeTabKey, selectedDriverText, telemetrySelectedText })
    const ssn = String(this.data.sessionName || "").trim()
    if (ssn) wx.setNavigationBarTitle({ title: ssn })
  }
})
