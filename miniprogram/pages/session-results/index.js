Page({
  data: {
    raceName: "",
    sessionName: "",
    sessionKey: 0,
    items: [],
    activeTab: 0,
    chartOptionBoxplot: null,
    boxplotHeightRpx: 520,
    selectedDriverNumbers: [],
    selectedDriverText: "",
    showPicker: false,
    pickedDriverNumbers: [],
    pickedMap: {}
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
    const raceName = decodeURIComponent(options.raceName || "")
    const sessionName = decodeURIComponent(options.sessionName || "")
    const sessionKey = Number(options.sessionKey || 0)
    this.setData({ raceName, sessionName, sessionKey }, () => {
      if (sessionName) {
        wx.setNavigationBarTitle({ title: sessionName })
      }
      this.loadResults()
    })
  },
  onShow() {
    if (this.data.activeTab === 1) {
      this.updateBoxplotHeight()
    }
  },
  onPullDownRefresh() {
    if (this.data.activeTab === 1) {
      this.loadBoxplot({ isPullDown: true })
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
        const selected = this.selectDefaultDrivers(mapped, this.data.selectedDriverNumbers)
        this.setData(
          {
            items: mapped,
            selectedDriverNumbers: selected,
            selectedDriverText: this.buildSelectedText(mapped, selected)
          },
          () => {
            if (this.data.activeTab === 1) {
              this.loadBoxplot()
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
    return labels.length ? `对比：${labels.join(" / ")}` : "请选择车手"
  },
  onTabTap(e) {
    const t = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 0)
    if (t === this.data.activeTab) return
    this.setData({ activeTab: t }, () => {
      if (t === 1) {
        this.updateBoxplotHeight()
        this.loadBoxplot()
      }
    })
  },
  onOpenPicker() {
    const picked = Array.isArray(this.data.selectedDriverNumbers) ? this.data.selectedDriverNumbers.slice() : []
    const pickedMap = {}
    for (const dn of picked) pickedMap[dn] = true
    this.setData({ showPicker: true, pickedDriverNumbers: picked, pickedMap })
  },
  onClosePicker() {
    this.setData({ showPicker: false })
  },
  onPickerCancel() {
    this.setData({ showPicker: false })
  },
  onPickerConfirm() {
    const picked = Array.isArray(this.data.pickedDriverNumbers) ? this.data.pickedDriverNumbers.slice() : []
    this.setData(
      {
        showPicker: false,
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
    const cur = Array.isArray(this.data.pickedDriverNumbers) ? this.data.pickedDriverNumbers.slice() : []
    const i = cur.indexOf(dn)
    if (i >= 0) cur.splice(i, 1)
    else cur.push(dn)
    cur.sort((a, b) => a - b)
    const pickedMap = {}
    for (const v of cur) pickedMap[v] = true
    this.setData({ pickedDriverNumbers: cur, pickedMap })
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
          return `${p.name}\n下须=${wl}\nQ1=${q1}\n中位数=${med}\nQ3=${q3}\n上须=${wh}`
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
  }
})
