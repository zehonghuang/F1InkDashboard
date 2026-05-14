const { buildGearOption, buildPedalOption, buildPowerOption } = require("../../services/optionFactory")
const { downsample, getLatest, loadMockTelemetry } = require("../../services/telemetryService")
const { formatGear, formatNumber } = require("../../utils/format")

const echarts = require("../../libs/echarts.min")

Page({
  data: {
    session: { id: "", name: "", track: "", vehicle: "", startTime: "", lapCount: 0 },
    samples: [],
    kpi: { speed: "-", rpm: "-", throttle: "-", brake: "-", gear: "-" },
    ec: { lazyLoad: true },
    echarts,
    activeTab: "power",
    _chartInited: { power: false, pedal: false, gear: false }
  },
  onLoad() {
    const data = loadMockTelemetry()
    const samples = downsample(data.samples, 1500)
    const latest = getLatest(samples)
    this.setData({
      session: data.session,
      samples,
      kpi: {
        speed: latest && latest.speed != null ? formatNumber(latest.speed, 0) : "-",
        rpm: latest && latest.rpm != null ? formatNumber(latest.rpm, 0) : "-",
        throttle: latest && latest.throttle != null ? formatNumber(latest.throttle, 0) : "-",
        brake: latest && latest.brake != null ? formatNumber(latest.brake, 0) : "-",
        gear: latest && latest.gear != null ? formatGear(latest.gear) : "-"
      }
    })
  },
  onReady() {
    this.initActiveChart()
  },
  goSettings() {
    wx.navigateTo({ url: "/pages/settings/index" })
  },
  goDetail() {
    const sessionId = this.data.session.id
    wx.navigateTo({ url: `/pages/session-detail/index?sessionId=${encodeURIComponent(sessionId)}` })
  },
  onTabChange(e) {
    const value = (e && e.detail && e.detail.value) || "power"
    this.setData({ activeTab: value }, () => this.initActiveChart())
  },
  initActiveChart() {
    const tab = this.data.activeTab
    const inited = this.data._chartInited && this.data._chartInited[tab]
    if (inited) return

    const idMap = {
      power: "#chart-power",
      pedal: "#chart-pedal",
      gear: "#chart-gear"
    }
    const comp = this.selectComponent(idMap[tab])
    if (!comp || typeof comp.init !== "function") return

    comp.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr })
      canvas.setChart(chart)
      const samples = this.data.samples
      const option =
        tab === "power" ? buildPowerOption(samples) : tab === "pedal" ? buildPedalOption(samples) : buildGearOption(samples)
      chart.setOption(option, { notMerge: true, lazyUpdate: false })
      this.setData({ _chartInited: { ...this.data._chartInited, [tab]: true } })
      return chart
    })
  }
})
