import { buildPowerOption } from "../../services/optionFactory"
import { downsample, loadMockTelemetry } from "../../services/telemetryService"

const echarts = require("echarts")

Page({
  data: {
    ec: { lazyLoad: true },
    echarts,
    themeLabel: "浅色",
    sampleJson: "",
    _inited: false
  },
  onLoad() {
    const data = loadMockTelemetry()
    const demo = {
      session: { id: data.session.id, name: data.session.name, track: data.session.track, vehicle: data.session.vehicle },
      samples: data.samples.slice(0, 3)
    }
    this.setData({ sampleJson: JSON.stringify(demo, null, 2) })
  },
  onReady() {
    if (this.data._inited) return
    const comp = this.selectComponent("#test-chart") as any
    if (!comp || typeof comp.init !== "function") return
    comp.init((canvas: any, width: number, height: number, dpr: number) => {
      const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr })
      canvas.setChart(chart)
      const data = loadMockTelemetry()
      const samples = downsample(data.samples, 800)
      chart.setOption(buildPowerOption(samples), { notMerge: true, lazyUpdate: false })
      this.setData({ _inited: true })
      return chart
    })
  },
  goBack() {
    wx.navigateBack()
  },
  copyJson() {
    wx.setClipboardData({ data: this.data.sampleJson })
  }
})
