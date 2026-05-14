import { buildGearOption, buildPedalOption, buildPowerOption } from "../../services/optionFactory"
import { downsample, loadMockTelemetry, TelemetrySample } from "../../services/telemetryService"

const echarts = require("echarts")

Page({
  data: {
    session: { id: "", name: "", track: "", vehicle: "", startTime: "", lapCount: 0 },
    samples: [] as TelemetrySample[],
    channels: ["speed", "rpm", "throttle", "brake", "gear"],
    ec: { lazyLoad: true },
    echarts,
    _inited: false
  },
  onLoad() {
    const data = loadMockTelemetry()
    this.setData({ session: data.session, samples: downsample(data.samples, 2000) })
  },
  onReady() {
    this.initCharts()
  },
  goBack() {
    wx.navigateBack()
  },
  onChannelsChange(e: any) {
    const value = e?.detail?.value ?? []
    this.setData({ channels: value }, () => this.updateCharts())
  },
  initCharts() {
    if (this.data._inited) return
    const comps = [
      this.selectComponent("#detail-power") as any,
      this.selectComponent("#detail-pedal") as any,
      this.selectComponent("#detail-gear") as any
    ]
    let remaining = comps.length
    const onDone = () => {
      remaining -= 1
      if (remaining <= 0) {
        this.setData({ _inited: true })
        this.updateCharts()
      }
    }
    comps.forEach((c) => {
      if (!c || typeof c.init !== "function") {
        onDone()
        return
      }
      c.init((canvas: any, width: number, height: number, dpr: number) => {
        const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr })
        canvas.setChart(chart)
        onDone()
        return chart
      })
    })
  },
  updateCharts() {
    const samples = this.data.samples
    const channels = new Set(this.data.channels)
    const powerComp = this.selectComponent("#detail-power") as any
    const pedalComp = this.selectComponent("#detail-pedal") as any
    const gearComp = this.selectComponent("#detail-gear") as any

    const setIfReady = (comp: any, option: any) => {
      const chart = comp?.chart
      if (chart) chart.setOption(option, { notMerge: true, lazyUpdate: false })
    }

    if (powerComp) {
      const opt = buildPowerOption(samples)
      opt.series = opt.series.filter((s: any) => (s.name === "速度" ? channels.has("speed") : channels.has("rpm")))
      setIfReady(powerComp, opt)
    }
    if (pedalComp) {
      const opt = buildPedalOption(samples)
      opt.series = opt.series.filter((s: any) => (s.name === "油门" ? channels.has("throttle") : channels.has("brake")))
      setIfReady(pedalComp, opt)
    }
    if (gearComp) {
      const opt = buildGearOption(samples)
      opt.series = opt.series.filter(() => channels.has("gear"))
      setIfReady(gearComp, opt)
    }
  }
})
