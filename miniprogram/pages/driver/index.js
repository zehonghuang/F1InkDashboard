Page({
  data: {
    sessionKey: 0,
    driverNumber: 0,
    driverName: "",
    raceName: "",
    sessionName: "",
    lapInfo: "",
    chartOptionTB: null,
    chartOptionSpeed: null
  },
  onLoad(options) {
    const sessionKey = Number(options.sessionKey || 0)
    const driverNumber = Number(options.driverNumber || 0)
    const driverName = decodeURIComponent(options.driverName || "")
    const raceName = decodeURIComponent(options.raceName || "")
    const sessionName = decodeURIComponent(options.sessionName || "")
    this.setData({ sessionKey, driverNumber, driverName, raceName, sessionName }, () => {
      if (driverName) {
        wx.setNavigationBarTitle({ title: driverName })
      }
      this.loadChart()
    })
  },
  onPullDownRefresh() {
    this.loadChart({ isPullDown: true })
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
    const url = `${apiBase.replace(/\/+$/, "")}/api/v1/mp/telemetry/sector_controls?session_key=${this.data.sessionKey}&driver_number=${this.data.driverNumber}&max_points=900`
    wx.request({
      url,
      method: "GET",
      success: (res) => {
        const data = (res && res.data) || {}
        const points = Array.isArray(data.points) ? data.points : []
        const x = points.map((_, i) => i)
        const toNumOrNull = (v) => {
          const n = Number(v)
          return Number.isFinite(n) ? n : null
        }
        const throttle = points.map((p) => toNumOrNull(p && p.throttle))
        const brake = points.map((p) => toNumOrNull(p && p.brake))
        const speed = points.map((p) => toNumOrNull(p && p.speed))
        const lapInfo = data.lap_time ? `最快圈${data.lap_number ? ` L${data.lap_number}` : ""} ${data.lap_time}` : ""

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
          legend: { data: ["Throttle", "Brake"], textStyle: { color: "rgba(255,255,255,0.7)" } },
          xAxis: {
            type: "category",
            data: xLabels,
            axisLabel: { color: "rgba(255,255,255,0.55)", interval: 0 },
            axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
            axisTick: { show: false }
          },
          yAxis: {
            type: "value",
            min: 0,
            max: 100,
            axisLabel: { color: "rgba(255,255,255,0.55)" },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
            axisLine: { show: false }
          },
          series: [
            {
              name: "Throttle",
              type: "line",
              data: throttle,
              showSymbol: false,
              smooth: false,
              lineStyle: { width: 2 },
              markLine: {
                silent: true,
                symbol: "none",
                lineStyle: { color: "rgba(255,255,255,0.12)", type: "dashed" },
                label: { show: false },
                data: [{ xAxis: i1 }, { xAxis: i2 }]
              }
            },
            { name: "Brake", type: "line", data: brake, showSymbol: false, smooth: false, lineStyle: { width: 2 } }
          ]
        }

        const optionSpeed = {
          backgroundColor: "#000000",
          color: ["#3498db"],
          grid: { left: 18, right: 18, top: 20, bottom: 22, containLabel: true },
          tooltip: tooltipSpeed,
          legend: { data: ["Speed"], textStyle: { color: "rgba(255,255,255,0.7)" } },
          xAxis: {
            type: "category",
            data: xLabels,
            axisLabel: { color: "rgba(255,255,255,0.55)", interval: 0 },
            axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
            axisTick: { show: false }
          },
          yAxis: {
            type: "value",
            axisLabel: { color: "rgba(255,255,255,0.55)" },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
            axisLine: { show: false }
          },
          series: [
            {
              name: "Speed",
              type: "line",
              data: speed,
              showSymbol: false,
              smooth: false,
              lineStyle: { width: 2 },
              markLine: {
                silent: true,
                symbol: "none",
                lineStyle: { color: "rgba(255,255,255,0.12)", type: "dashed" },
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
  }
})
