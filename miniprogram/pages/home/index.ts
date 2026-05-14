import { buildGearOption, buildPedalOption, buildPowerOption } from "../../services/optionFactory"
import { downsample, getLatest, loadMockTelemetry, TelemetrySample } from "../../services/telemetryService"
import { formatGear, formatNumber } from "../../utils/format"

const echarts = require("echarts")

type TabKey = "power" | "pedal" | "gear"

Page({
  data: {
    session: { id: "", name: "", track: "", vehicle: "", startTime: "", lapCount: 0 },
    samples: [] as TelemetrySample[],
    kpi: { speed: "-", rpm: "-", throttle: "-", brake: "-", gear: "-" },
    ec: { lazyLoad: true },
    echarts,
    activeTab: "power" as TabKey,
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
        speed: latest?.speed != null ? formatNumber(latest.speed, 0) : "-",
        rpm: latest?.rpm != null ? formatNumber(latest.rpm, 0) : "-",
        throttle: latest?.throttle != null ? formatNumber(latest.throttle, 0) : "-",
        brake: latest?.brake != null ? formatNumber(latest.brake, 0) : "-",
        gear: latest?.gear != null ? formatGear(latest.gear) : "-"
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
  onTabChange(e: any) {
    const value = (e?.detail?.value ?? "power") as TabKey
    this.setData({ activeTab: value }, () => this.initActiveChart())
  },
  initActiveChart() {
    const tab = this.data.activeTab
    const inited = (this.data as any)._chartInited?.[tab]
    if (inited) return

    const idMap: Record<TabKey, string> = {
      power: "#chart-power",
      pedal: "#chart-pedal",
      gear: "#chart-gear"
    }
    const comp = this.selectComponent(idMap[tab]) as any
    if (!comp || typeof comp.init !== "function") return

    comp.init((canvas: any, width: number, height: number, dpr: number) => {
      const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr })
      canvas.setChart(chart)
      const samples = this.data.samples
      const option =
        tab === "power" ? buildPowerOption(samples) : tab === "pedal" ? buildPedalOption(samples) : buildGearOption(samples)
      chart.setOption(option, { notMerge: true, lazyUpdate: false })
      this.setData({ _chartInited: { ...(this.data as any)._chartInited, [tab]: true } })
      return chart
    })
  }
})
