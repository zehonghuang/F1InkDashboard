Page({
  data: {
    sessionKey: 0,
    driverNumber: 0,
    driverName: "",
    raceName: "",
    sessionName: "",
    lapInfo: "",
    chartOption: null
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
    const url = `${apiBase.replace(/\/+$/, "")}/api/v1/mp/telemetry/controls?session_key=${this.data.sessionKey}&driver_number=${this.data.driverNumber}&n=360`
    wx.request({
      url,
      method: "GET",
      success: (res) => {
        const data = (res && res.data) || {}
        const points = Array.isArray(data.points) ? data.points : []
        const lapInfo = data.lap_time ? `最快圈${data.lap_number ? ` L${data.lap_number}` : ""} ${data.lap_time}` : ""
        const x = points.map((p) => p.t)
        const throttle = points.map((p) => p.throttle)
        const brake = points.map((p) => p.brake)
        const option = {
          backgroundColor: "#000000",
          color: ["#2ecc71", "#e74c3c"],
          grid: { left: 18, right: 18, top: 20, bottom: 22, containLabel: true },
          tooltip: { trigger: "axis", confine: true },
          legend: { data: ["Throttle", "Brake"], textStyle: { color: "rgba(255,255,255,0.7)" } },
          xAxis: {
            type: "category",
            data: x,
            axisLabel: { color: "rgba(255,255,255,0.55)", formatter: (v) => `${v}s` },
            axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
            axisTick: { show: false }
          },
          yAxis: {
            type: "value",
            min: 0,
            max: 100,
            axisLabel: { color: "rgba(255,255,255,0.55)", formatter: "{value}%" },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
            axisLine: { show: false }
          },
          series: [
            { name: "Throttle", type: "line", data: throttle, showSymbol: false, smooth: true, lineStyle: { width: 2 } },
            { name: "Brake", type: "line", data: brake, showSymbol: false, smooth: true, lineStyle: { width: 2 } }
          ]
        }
        this.setData({ chartOption: option, lapInfo })
        done()
      },
      fail: () => {
        done()
      }
    })
  }
})
