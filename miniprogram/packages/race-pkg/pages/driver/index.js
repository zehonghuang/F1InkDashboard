const { buildChartsShareUrl } = require("../../services/chartsShare")
const i18n = require("../../../../services/i18n")

Page({
  data: {
    i18n: i18n.getDict(),
    sessionKey: 0,
    driverNumber: 0,
    driverName: "",
    raceName: "",
    sessionName: "",
    lapInfo: "",
    showLapPicker: false,
    lapOptions: [{ label: i18n.t("driver.fastestLap"), value: 0 }],
    lapIndex: 0,
    selectedLapNumber: 0,
    chartOptionTB: null,
    chartOptionSpeed: null
  },
  onLoad(options) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    const sessionKey = Number(options.sessionKey || 0)
    const driverNumber = Number(options.driverNumber || 0)
    const driverName = decodeURIComponent(options.driverName || "")
    const raceName = decodeURIComponent(options.raceName || "")
    const sessionName = decodeURIComponent(options.sessionName || "")
    const showLapPicker = /正赛/.test(sessionName) || /\brace\b/i.test(sessionName)
    this.setData({ sessionKey, driverNumber, driverName, raceName, sessionName, showLapPicker }, () => {
      this.applyI18n()
      if (driverName) {
        wx.setNavigationBarTitle({ title: driverName })
      }
      if (showLapPicker) {
        this.loadLapOptions()
      }
      this.loadChart()
    })
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onPullDownRefresh() {
    this.loadChart({ isPullDown: true })
  },
  onLapChange(e) {
    const idx = Number((e && e.detail && e.detail.value) || 0)
    const opt = (this.data.lapOptions && this.data.lapOptions[idx]) || { value: 0 }
    const ln = Number(opt.value || 0)
    this.setData({ lapIndex: idx, selectedLapNumber: ln }, () => {
      this.loadChart()
    })
  },
  loadLapOptions() {
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    if (!apiBase || !this.data.sessionKey || !this.data.driverNumber) {
      return
    }

    const formatLapDuration = (seconds) => {
      const s = Number(seconds)
      if (!Number.isFinite(s) || s <= 0) return ""
      const m = Math.floor(s / 60)
      const rem = s - m * 60
      const remFixed = rem.toFixed(3)
      const [secStr, fracStr = ""] = remFixed.split(".")
      const sec2 = secStr.padStart(2, "0")
      return `${m}:${sec2}.${fracStr}`
    }

    const url = `${apiBase.replace(/\/+$/, "")}/api/v1/telemetry/laps?session_key=${this.data.sessionKey}&driver_number=${this.data.driverNumber}`
    wx.request({
      url,
      method: "GET",
      success: (res) => {
        const data = (res && res.data) || {}
        const laps = Array.isArray(data.laps) ? data.laps : []
        const opts = [{ label: i18n.t("driver.fastestLap"), value: 0 }]
        for (const it of laps) {
          const ln = Number(it && it.lap_number)
          const dur = it && it.lap_duration
          if (!ln || !(Number(dur) > 0)) continue
          const t = formatLapDuration(dur)
          opts.push({ label: `L${ln}${t ? ` ${t}` : ""}`, value: ln })
        }
        const curValue = Number(this.data.selectedLapNumber || 0)
        let nextIndex = 0
        if (curValue > 0) {
          const found = opts.findIndex((x) => Number(x.value) === curValue)
          if (found >= 0) nextIndex = found
        }
        this.setData({ lapOptions: opts, lapIndex: nextIndex })
      }
    })
  },
  loadChart(opts) {
    const done = () => {
      if (opts && opts.isPullDown) {
        wx.stopPullDownRefresh()
      }
    }
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    if (!apiBase || !this.data.sessionKey || !this.data.driverNumber) {
      done()
      return
    }
    const ln = Number(this.data.selectedLapNumber || 0)
    const lapParam = ln > 0 ? `&lap_number=${ln}` : ""
    const url = `${apiBase.replace(/\/+$/, "")}/api/v1/mp/telemetry/sector_controls?session_key=${this.data.sessionKey}&driver_number=${this.data.driverNumber}&max_points=900${lapParam}`
    wx.request({
      url,
      method: "GET",
      header: { "Accept-Language": i18n.getLocale() },
      success: (res) => {
        const data = (res && res.data) || {}
        this._lastLapNumber = Number(data.lap_number || 0)
        const points = Array.isArray(data.points) ? data.points : []
        const x = points.map((_, i) => i)
        const toNumOrNull = (v) => {
          const n = Number(v)
          return Number.isFinite(n) ? n : null
        }
        const throttle = points.map((p) => toNumOrNull(p && p.throttle))
        const brake = points.map((p) => toNumOrNull(p && p.brake))
        const speed = points.map((p) => toNumOrNull(p && p.speed))
        const lapInfo = data.lap_time
          ? `${ln > 0 ? `L${data.lap_number || ln}` : `${i18n.t("driver.fastestLap")}${data.lap_number ? ` L${data.lap_number}` : ""}`} ${data.lap_time}`
          : ""

        const nPoints = x.length
        const i1 = Number.isFinite(data.s1_end_i) ? data.s1_end_i : Math.floor(nPoints / 3)
        const i2 = Number.isFinite(data.s2_end_i) ? data.s2_end_i : Math.floor((2 * nPoints) / 3)
        const mid1 = Math.floor(i1 / 2)
        const mid2 = Math.floor((i1 + i2) / 2)
        const mid3 = Math.floor((i2 + Math.max(i2, nPoints - 1)) / 2)
        const xLabels = x.map((_, idx) => {
          if (idx === mid1) return "S1"
          if (idx === mid2) return "S2"
          if (idx === mid3) return "S3"
          return ""
        })

        const formatLapClock = (seconds) => {
          if (seconds == null || !Number.isFinite(seconds)) return ""
          const s = Math.max(0, seconds)
          const m = Math.floor(s / 60)
          const rem = s - m * 60
          const remFixed = rem.toFixed(3)
          const [secStr, fracStr = ""] = remFixed.split(".")
          const sec2 = secStr.padStart(2, "0")
          return `${m}:${sec2}.${fracStr}`
        }

        const sectorOfIndex = (idx) => {
          if (idx <= i1) return 1
          if (idx <= i2) return 2
          return 3
        }

        const tooltipTB = {
          trigger: "axis",
          confine: true,
          formatter: (params) => {
            const it = Array.isArray(params) ? params[0] : null
            const di = it && Number.isFinite(it.dataIndex) ? it.dataIndex : null
            const meta = di != null ? points[di] : null
            const tms = meta && meta.t_ms != null ? Number(meta.t_ms) : null
            const tStr = tms != null && Number.isFinite(tms) ? formatLapClock(tms / 1000) : ""
            const sec = di != null ? sectorOfIndex(di) : null
            const header = `${tStr}${sec ? ` · S${sec}` : ""}`
            const lines = [header]
            for (const p of params || []) {
              const v = p && p.data != null ? Number(p.data) : null
              const val = v != null && Number.isFinite(v) ? `${Math.round(v)}%` : "N/A"
              lines.push(`${p.marker || ""} ${p.seriesName}: ${val}`)
            }
            return lines.join("\n")
          }
        }

        const tooltipSpeed = {
          trigger: "axis",
          confine: true,
          formatter: (params) => {
            const it = Array.isArray(params) ? params[0] : null
            const di = it && Number.isFinite(it.dataIndex) ? it.dataIndex : null
            const meta = di != null ? points[di] : null
            const tms = meta && meta.t_ms != null ? Number(meta.t_ms) : null
            const tStr = tms != null && Number.isFinite(tms) ? formatLapClock(tms / 1000) : ""
            const sec = di != null ? sectorOfIndex(di) : null
            const header = `${tStr}${sec ? ` · S${sec}` : ""}`
            const p0 = Array.isArray(params) ? params[0] : null
            const v0 = p0 && p0.data != null ? Number(p0.data) : null
            const val = v0 != null && Number.isFinite(v0) ? `${Math.round(v0)} km/h` : "N/A"
            return `${header}\n${p0 && p0.marker ? p0.marker : ""} Speed: ${val}`
          }
        }

        const optionTB = {
          backgroundColor: "#000000",
          color: ["#2ecc71", "#e74c3c"],
          grid: { left: 18, right: 18, top: 20, bottom: 22, containLabel: true },
          tooltip: tooltipTB,
          legend: { data: [i18n.t("driver.throttle"), i18n.t("driver.brake")], textStyle: { color: "rgba(255,255,255,0.7)" } },
          xAxis: {
            type: "category",
            data: xLabels,
            axisLabel: { color: "rgba(255,255,255,0.55)", interval: 0, fontSize: 12 },
            axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)", width: 1 } },
            axisTick: { show: false }
          },
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
          series: [
            {
              name: i18n.t("driver.throttle"),
              type: "line",
              data: throttle,
              showSymbol: false,
              smooth: false,
              lineStyle: { width: 1.5 },
              markLine: {
                silent: true,
                symbol: "none",
                lineStyle: { color: "rgba(255,255,255,0.12)", type: "dashed", width: 1 },
                label: { show: false },
                data: [{ xAxis: i1 }, { xAxis: i2 }]
              }
            },
            { name: i18n.t("driver.brake"), type: "line", data: brake, showSymbol: false, smooth: false, lineStyle: { width: 1.5 } }
          ]
        }

        const optionSpeed = {
          backgroundColor: "#000000",
          color: ["#3498db"],
          grid: { left: 18, right: 18, top: 20, bottom: 22, containLabel: true },
          tooltip: tooltipSpeed,
          legend: { data: [i18n.t("driver.speed")], textStyle: { color: "rgba(255,255,255,0.7)" } },
          xAxis: {
            type: "category",
            data: xLabels,
            axisLabel: { color: "rgba(255,255,255,0.55)", interval: 0, fontSize: 12 },
            axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)", width: 1 } },
            axisTick: { show: false }
          },
          yAxis: {
            type: "value",
            axisLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)", width: 1 } },
            minorTick: { show: true, splitNumber: 2, lineStyle: { color: "rgba(255,255,255,0.06)", width: 1 } },
            minorSplitLine: { show: true, lineStyle: { color: "rgba(255,255,255,0.04)", width: 1 } },
            axisLine: { show: false }
          },
          series: [
            {
              name: i18n.t("driver.speed"),
              type: "line",
              data: speed,
              showSymbol: false,
              smooth: false,
              lineStyle: { width: 1.5 },
              markLine: {
                silent: true,
                symbol: "none",
                lineStyle: { color: "rgba(255,255,255,0.12)", type: "dashed", width: 1 },
                label: { show: false },
                data: [{ xAxis: i1 }, { xAxis: i2 }]
              }
            }
          ]
        }

        this.setData({ chartOptionTB: optionTB, chartOptionSpeed: optionSpeed, lapInfo })
        done()
      },
      fail: () => {
        done()
      }
    })
  },
  onCopyTelemetryLink() {
    const sessionKey = Number(this.data.sessionKey || 0)
    const dn = Number(this.data.driverNumber || 0)
    if (!sessionKey || !dn) {
      wx.showToast({ title: i18n.t("common.noLinkToCopy"), icon: "none" })
      return
    }
    const ln0 = Number(this.data.selectedLapNumber || 0)
    const ln = ln0 > 0 ? ln0 : Number(this._lastLapNumber || 0)
    let url = ""
    try {
      url = buildChartsShareUrl({
        page: "driver-telemetry",
        driver_number: dn,
        session_key: sessionKey,
        lap_number: ln > 0 ? ln : undefined
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
  applyI18n() {
    const dict = i18n.getDict()
    const opts = Array.isArray(this.data.lapOptions) ? this.data.lapOptions.slice() : []
    if (opts[0] && Number(opts[0].value) === 0) {
      opts[0] = { ...opts[0], label: dict.driver.fastestLap }
    }
    this.setData({ i18n: dict, lapOptions: opts })
  }
})
