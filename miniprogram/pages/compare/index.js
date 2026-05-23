Page({
  data: {
    sessionKey: 0,
    activeTab: "driver",
    slotA: null,
    slotB: null,
    lapInfoA: "",
    lapInfoB: "",
    canCompare: false,
    kpiText: "",
    driverCompareText: "",
    teamCompareText: "",
    driverA: { position: "-", lapTime: "-", deltaLap: "-", team: "-" },
    driverB: { position: "-", lapTime: "-", deltaLap: "-", team: "-" },
    teamA: { name: "-", bestPos: "-", bestLap: "-", posSum: "-" },
    teamB: { name: "-", bestPos: "-", bestLap: "-", posSum: "-" },
    chartOptionTB: null,
    chartOptionSpeed: null
  },
  onLoad() {
    this.restoreState()
  },
  onShow() {
    if (typeof this.getTabBar === 'function') {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === 'function') {
        tb.setSelectedByRoute(this.route)
      }
    }

    this.consumePendingAdd()
  },
  onSelectTab(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || ""
    if (!tab || tab === this.data.activeTab) return
    this.setData({ activeTab: tab }, () => {
      this.updateCompareMeta()
      if (tab === "driver" && this.data.canCompare) this.refreshCharts()
    })
  },
  emptySlot(tag) {
    return {
      tag,
      driverNumber: 0,
      driverName: "",
      raceName: "",
      sessionName: "",
      lapNumber: 0,
      lapOptions: [{ label: "最快圈", value: 0 }],
      lapIndex: 0,
      title: "未选择",
      sub: "从“车手”页加入对比"
    }
  },
  getApiBase() {
    const app = getApp()
    const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
    return apiBase ? apiBase.replace(/\/+$/, "") : ""
  },
  restoreState() {
    const KEY_STATE = "mp_compare_state"
    const st = wx.getStorageSync(KEY_STATE) || {}
    const sessionKey = Number(st.sessionKey || 0)
    const slotA = this.buildSlotData("A", st.a)
    const slotB = this.buildSlotData("B", st.b)
    const canCompare = !!(sessionKey && slotA.driverNumber && slotB.driverNumber)
    this.setData(
      {
        sessionKey,
        slotA,
        slotB,
        canCompare,
        kpiText: "",
        lapInfoA: "",
        lapInfoB: "",
        chartOptionTB: null,
        chartOptionSpeed: null
      },
      () => {
        if (slotA.driverNumber) this.loadLapOptions("A")
        if (slotB.driverNumber) this.loadLapOptions("B")
        if (canCompare) this.refreshCharts()
        this.updateCompareMeta()
      }
    )
  },
  buildSlotData(tag, src) {
    const base = this.emptySlot(tag)
    const s = src || {}
    const driverNumber = Number(s.driverNumber || 0)
    const driverName = String(s.driverName || "")
    const raceName = String(s.raceName || "")
    const sessionName = String(s.sessionName || "")
    const lapNumber = Number(s.lapNumber || 0)
    const lapOptions = Array.isArray(s.lapOptions) && s.lapOptions.length ? s.lapOptions : base.lapOptions
    const lapIndex = Number.isFinite(s.lapIndex) ? Number(s.lapIndex) : 0
    const title = driverNumber ? `${driverName || `#${driverNumber}`} (#${driverNumber})` : base.title
    const subParts = []
    if (raceName || sessionName) subParts.push(`${raceName}${raceName && sessionName ? " · " : ""}${sessionName}`)
    if (driverNumber) subParts.push(lapNumber > 0 ? `L${lapNumber}` : "最快圈")
    const sub = subParts.length ? subParts.join(" · ") : base.sub
    return { ...base, driverNumber, driverName, raceName, sessionName, lapNumber, lapOptions, lapIndex, title, sub }
  },
  consumePendingAdd() {
    const KEY_PENDING = "mp_compare_pending_add"
    const pending = wx.getStorageSync(KEY_PENDING)
    if (!pending) return
    wx.removeStorageSync(KEY_PENDING)
    const item = pending && pending.item ? pending.item : pending
    this.applyAddItem(item)
  },
  applyAddItem(item) {
    const sessionKey = Number(item && item.sessionKey)
    const driverNumber = Number(item && item.driverNumber)
    if (!sessionKey || !driverNumber) return

    const KEY_STATE = "mp_compare_state"
    const cur = wx.getStorageSync(KEY_STATE) || {}
    const next = { ...cur }
    if (next.sessionKey && Number(next.sessionKey) !== sessionKey) {
      wx.showToast({ title: "已切换 Session，清空旧对比", icon: "none" })
      next.a = null
      next.b = null
    }
    next.sessionKey = sessionKey

    const normalized = {
      driverNumber,
      driverName: String(item.driverName || ""),
      raceName: String(item.raceName || ""),
      sessionName: String(item.sessionName || ""),
      lapNumber: Number(item.lapNumber || 0),
      lapOptions: [{ label: "最快圈", value: 0 }],
      lapIndex: 0
    }

    if (!next.a || !Number(next.a.driverNumber)) {
      next.a = normalized
    } else if (!next.b || !Number(next.b.driverNumber)) {
      next.b = normalized
    } else {
      next.b = normalized
    }

    wx.setStorageSync(KEY_STATE, next)
    this.restoreState()
  },
  onLapChangeA(e) {
    this.applyLapChange("A", e)
  },
  onLapChangeB(e) {
    this.applyLapChange("B", e)
  },
  applyLapChange(tag, e) {
    const idx = Number((e && e.detail && e.detail.value) || 0)
    const slotKey = tag === "A" ? "slotA" : "slotB"
    const slot = this.data[slotKey] || this.emptySlot(tag)
    const opt = (slot.lapOptions && slot.lapOptions[idx]) || { value: 0 }
    const ln = Number(opt.value || 0)
    const nextSlot = { ...slot, lapIndex: idx, lapNumber: ln }
    this.setData({ [slotKey]: nextSlot }, () => {
      this.persistSlots()
      this.updateCompareMeta()
      if (this.data.canCompare) this.refreshCharts()
    })
  },
  persistSlots() {
    const KEY_STATE = "mp_compare_state"
    const st = {
      sessionKey: Number(this.data.sessionKey || 0),
      a: this.exportSlot(this.data.slotA),
      b: this.exportSlot(this.data.slotB)
    }
    wx.setStorageSync(KEY_STATE, st)
  },
  exportSlot(slot) {
    if (!slot || !slot.driverNumber) return null
    return {
      driverNumber: Number(slot.driverNumber || 0),
      driverName: String(slot.driverName || ""),
      raceName: String(slot.raceName || ""),
      sessionName: String(slot.sessionName || ""),
      lapNumber: Number(slot.lapNumber || 0),
      lapOptions: slot.lapOptions,
      lapIndex: Number(slot.lapIndex || 0)
    }
  },
  onClearA() {
    this.setData({ slotA: this.emptySlot("A") }, () => {
      this.persistSlots()
      this.updateCompareMeta()
      this.refreshCharts()
    })
  },
  onClearB() {
    this.setData({ slotB: this.emptySlot("B") }, () => {
      this.persistSlots()
      this.updateCompareMeta()
      this.refreshCharts()
    })
  },
  onClearAll() {
    this.setData({ slotA: this.emptySlot("A"), slotB: this.emptySlot("B"), sessionKey: 0 }, () => {
      const KEY_STATE = "mp_compare_state"
      wx.removeStorageSync(KEY_STATE)
      this.updateCompareMeta()
      this.refreshCharts()
    })
  },
  parseLapTime(s) {
    const str = String(s || "").trim()
    if (!str) return null
    const m = str.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/)
    if (m) {
      const mm = Number(m[1])
      const ss = Number(m[2])
      const ms = Number(m[3].padEnd(3, "0"))
      if (!Number.isFinite(mm) || !Number.isFinite(ss) || !Number.isFinite(ms)) return null
      return mm * 60 + ss + ms / 1000
    }
    const n = Number(str)
    return Number.isFinite(n) ? n : null
  },
  formatDeltaSeconds(sec) {
    if (sec == null || !Number.isFinite(sec)) return "-"
    const sign = sec >= 0 ? "+" : "-"
    const abs = Math.abs(sec)
    return `${sign}${abs.toFixed(3)}s`
  },
  ensureSessionResults() {
    const apiBase = this.getApiBase()
    const sessionKey = Number(this.data.sessionKey || 0)
    if (!apiBase || !sessionKey) return Promise.resolve(null)
    if (this._resultsCache && this._resultsCache.sessionKey === sessionKey) return Promise.resolve(this._resultsCache)

    const url = `${apiBase}/api/v1/mp/session-results?session_key=${sessionKey}`
    return new Promise((resolve) => {
      wx.request({
        url,
        method: "GET",
        success: (res) => {
          const data = (res && res.data) || {}
          const items = Array.isArray(data.items) ? data.items : []
          const byDriver = {}
          const byTeam = {}
          for (const it of items) {
            const dn = Number(it && it.driver_number)
            if (dn) byDriver[dn] = it
            const team = String((it && it.team_name) || "").trim()
            if (team) {
              if (!byTeam[team]) byTeam[team] = []
              byTeam[team].push(it)
            }
          }
          this._resultsCache = { sessionKey, byDriver, byTeam, items }
          resolve(this._resultsCache)
        },
        fail: () => resolve(null)
      })
    })
  },
  calcTeamAgg(teamName, teamItems) {
    const name = teamName || "-"
    const positions = []
    const laps = []
    for (const it of teamItems || []) {
      const p = Number(it && it.position)
      if (Number.isFinite(p) && p > 0) positions.push(p)
      const lt = this.parseLapTime(it && it.lap_time)
      if (lt != null) laps.push(lt)
    }
    positions.sort((a, b) => a - b)
    const bestPos = positions.length ? String(positions[0]) : "-"
    const posSum = positions.length >= 2 ? String(positions[0] + positions[1]) : positions.length === 1 ? String(positions[0]) : "-"
    let bestLap = "-"
    if (laps.length) {
      const min = Math.min(...laps)
      if (Number.isFinite(min)) {
        const mm = Math.floor(min / 60)
        const ss = (min - mm * 60).toFixed(3)
        const [secStr, fracStr = ""] = String(ss).split(".")
        bestLap = `${mm}:${secStr.padStart(2, "0")}.${fracStr.padEnd(3, "0")}`
      }
    }
    return { name, bestPos, bestLap, posSum }
  },
  updateCompareMeta() {
    const sessionKey = Number(this.data.sessionKey || 0)
    const a = this.data.slotA || this.emptySlot("A")
    const b = this.data.slotB || this.emptySlot("B")
    const canCompare = !!(sessionKey && a.driverNumber && b.driverNumber)
    if (!canCompare) {
      this.setData({
        canCompare: false,
        driverCompareText: "",
        teamCompareText: "",
        driverA: { position: "-", lapTime: "-", deltaLap: "-", team: "-" },
        driverB: { position: "-", lapTime: "-", deltaLap: "-", team: "-" },
        teamA: { name: "-", bestPos: "-", bestLap: "-", posSum: "-" },
        teamB: { name: "-", bestPos: "-", bestLap: "-", posSum: "-" }
      })
      return
    }

    this.ensureSessionResults().then((cache) => {
      const byDriver = (cache && cache.byDriver) || {}
      const byTeam = (cache && cache.byTeam) || {}
      const ia = byDriver[a.driverNumber] || {}
      const ib = byDriver[b.driverNumber] || {}

      const posA = ia.position != null ? String(ia.position) : "-"
      const posB = ib.position != null ? String(ib.position) : "-"
      const lapA = ia.lap_time ? String(ia.lap_time) : "-"
      const lapB = ib.lap_time ? String(ib.lap_time) : "-"
      const teamAName = ia.team_name ? String(ia.team_name) : "-"
      const teamBName = ib.team_name ? String(ib.team_name) : "-"

      const lapASec = this.parseLapTime(ia.lap_time)
      const lapBSec = this.parseLapTime(ib.lap_time)
      const deltaLap = lapASec != null && lapBSec != null ? this.formatDeltaSeconds(lapASec - lapBSec) : "-"

      const driverCompareText = lapASec != null && lapBSec != null ? `Δ圈速（A-B）${deltaLap}` : ""

      const ta = teamAName !== "-" ? this.calcTeamAgg(teamAName, byTeam[teamAName] || []) : { name: "-", bestPos: "-", bestLap: "-", posSum: "-" }
      const tb = teamBName !== "-" ? this.calcTeamAgg(teamBName, byTeam[teamBName] || []) : { name: "-", bestPos: "-", bestLap: "-", posSum: "-" }
      const teamCompareText = teamAName !== "-" && teamBName !== "-" ? `${ta.name} vs ${tb.name}` : ""

      this.setData({
        canCompare: true,
        driverCompareText,
        teamCompareText,
        driverA: { position: posA, lapTime: lapA, deltaLap, team: teamAName },
        driverB: { position: posB, lapTime: lapB, deltaLap: "-", team: teamBName },
        teamA: ta,
        teamB: tb
      })
    })
  },
  loadLapOptions(tag) {
    const apiBase = this.getApiBase()
    if (!apiBase) return
    const slotKey = tag === "A" ? "slotA" : "slotB"
    const slot = this.data[slotKey] || this.emptySlot(tag)
    const sessionKey = Number(this.data.sessionKey || 0)
    const driverNumber = Number(slot.driverNumber || 0)
    if (!sessionKey || !driverNumber) return

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

    const url = `${apiBase}/api/v1/telemetry/laps?session_key=${sessionKey}&driver_number=${driverNumber}`
    wx.request({
      url,
      method: "GET",
      success: (res) => {
        const data = (res && res.data) || {}
        const laps = Array.isArray(data.laps) ? data.laps : []
        const opts = [{ label: "最快圈", value: 0 }]
        for (const it of laps) {
          const ln = Number(it && it.lap_number)
          const dur = it && it.lap_duration
          if (!ln || !(Number(dur) > 0)) continue
          const t = formatLapDuration(dur)
          opts.push({ label: `L${ln}${t ? ` ${t}` : ""}`, value: ln })
        }
        const curValue = Number(slot.lapNumber || 0)
        let nextIndex = 0
        if (curValue > 0) {
          const found = opts.findIndex((x) => Number(x.value) === curValue)
          if (found >= 0) nextIndex = found
        }
        const nextSlot = { ...slot, lapOptions: opts, lapIndex: nextIndex }
        this.setData({ [slotKey]: nextSlot }, () => {
          this.persistSlots()
        })
      }
    })
  },
  refreshCharts() {
    const sessionKey = Number(this.data.sessionKey || 0)
    const a = this.data.slotA || this.emptySlot("A")
    const b = this.data.slotB || this.emptySlot("B")
    const canCompare = !!(sessionKey && a.driverNumber && b.driverNumber)
    if (!canCompare) {
      this.setData({
        canCompare: false,
        kpiText: "",
        lapInfoA: "",
        lapInfoB: "",
        chartOptionTB: null,
        chartOptionSpeed: null
      })
      return
    }

    this.setData({ canCompare: true })
    const apiBase = this.getApiBase()
    if (!apiBase) return

    const buildUrl = (slot) => {
      const ln = Number(slot.lapNumber || 0)
      const lapParam = ln > 0 ? `&lap_number=${ln}` : ""
      return `${apiBase}/api/v1/mp/telemetry/sector_controls?session_key=${sessionKey}&driver_number=${slot.driverNumber}&max_points=900${lapParam}`
    }

    const req = (url) =>
      new Promise((resolve) => {
        wx.request({
          url,
          method: "GET",
          success: (res) => resolve((res && res.data) || {}),
          fail: () => resolve({})
        })
      })

    Promise.all([req(buildUrl(a)), req(buildUrl(b))]).then(([da, db]) => {
      const pa = Array.isArray(da.points) ? da.points : []
      const pb = Array.isArray(db.points) ? db.points : []
      const n = Math.min(pa.length, pb.length)
      if (!n) {
        this.setData({ chartOptionTB: null, chartOptionSpeed: null, kpiText: "" })
        return
      }
      const pointsA = pa.slice(0, n)
      const pointsB = pb.slice(0, n)
      const x = pointsA.map((_, i) => i)
      const toNumOrNull = (v) => {
        const num = Number(v)
        return Number.isFinite(num) ? num : null
      }

      const throttleA = pointsA.map((p) => toNumOrNull(p && p.throttle))
      const brakeA = pointsA.map((p) => toNumOrNull(p && p.brake))
      const speedA = pointsA.map((p) => toNumOrNull(p && p.speed))
      const throttleB = pointsB.map((p) => toNumOrNull(p && p.throttle))
      const brakeB = pointsB.map((p) => toNumOrNull(p && p.brake))
      const speedB = pointsB.map((p) => toNumOrNull(p && p.speed))

      const deltaSpeed = x.map((i) => {
        const va = speedA[i]
        const vb = speedB[i]
        if (va == null || vb == null) return null
        return va - vb
      })

      const lapInfoA = da.lap_time
        ? `${Number(a.lapNumber) > 0 ? `L${da.lap_number || a.lapNumber}` : `最快圈${da.lap_number ? ` L${da.lap_number}` : ""}`} ${da.lap_time}`
        : ""
      const lapInfoB = db.lap_time
        ? `${Number(b.lapNumber) > 0 ? `L${db.lap_number || b.lapNumber}` : `最快圈${db.lap_number ? ` L${db.lap_number}` : ""}`} ${db.lap_time}`
        : ""

      const i1Raw = Number.isFinite(da.s1_end_i) ? da.s1_end_i : Number.isFinite(db.s1_end_i) ? db.s1_end_i : Math.floor(n / 3)
      const i2Raw = Number.isFinite(da.s2_end_i) ? da.s2_end_i : Number.isFinite(db.s2_end_i) ? db.s2_end_i : Math.floor((2 * n) / 3)
      const i1 = Math.max(0, Math.min(n - 1, Number(i1Raw)))
      const i2 = Math.max(0, Math.min(n - 1, Number(i2Raw)))
      const mid1 = Math.floor(i1 / 2)
      const mid2 = Math.floor((i1 + i2) / 2)
      const mid3 = Math.floor((i2 + Math.max(i2, n - 1)) / 2)
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

      const tooltipHeader = (di) => {
        const ma = pointsA[di]
        const mb = pointsB[di]
        const tms = ma && ma.t_ms != null ? Number(ma.t_ms) : mb && mb.t_ms != null ? Number(mb.t_ms) : null
        const tStr = tms != null && Number.isFinite(tms) ? formatLapClock(tms / 1000) : ""
        const sec = di != null ? sectorOfIndex(di) : null
        return `${tStr}${sec ? ` · S${sec}` : ""}`
      }

      const optionTB = {
        backgroundColor: "#000000",
        color: ["#2ecc71", "#e74c3c", "rgba(46,204,113,0.55)", "rgba(231,76,60,0.55)"],
        grid: { left: 18, right: 18, top: 20, bottom: 22, containLabel: true },
        tooltip: {
          trigger: "axis",
          confine: true,
          formatter: (params) => {
            const it0 = Array.isArray(params) ? params[0] : null
            const di = it0 && Number.isFinite(it0.dataIndex) ? it0.dataIndex : null
            const lines = [di != null ? tooltipHeader(di) : ""].filter(Boolean)
            for (const p of params || []) {
              const v = p && p.data != null ? Number(p.data) : null
              const val = v != null && Number.isFinite(v) ? `${Math.round(v)}%` : "N/A"
              lines.push(`${p.marker || ""} ${p.seriesName}: ${val}`)
            }
            return lines.join("\n")
          }
        },
        legend: { data: ["A Throttle", "A Brake", "B Throttle", "B Brake"], textStyle: { color: "rgba(255,255,255,0.7)" } },
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
            name: "A Throttle",
            type: "line",
            data: throttleA,
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
          { name: "A Brake", type: "line", data: brakeA, showSymbol: false, smooth: false, lineStyle: { width: 2 } },
          { name: "B Throttle", type: "line", data: throttleB, showSymbol: false, smooth: false, lineStyle: { width: 2 } },
          { name: "B Brake", type: "line", data: brakeB, showSymbol: false, smooth: false, lineStyle: { width: 2 } }
        ]
      }

      const tooltipSpeed = {
        trigger: "axis",
        confine: true,
        formatter: (params) => {
          const it0 = Array.isArray(params) ? params[0] : null
          const di = it0 && Number.isFinite(it0.dataIndex) ? it0.dataIndex : null
          const header = di != null ? tooltipHeader(di) : ""
          const lines = [header].filter(Boolean)
          for (const p of params || []) {
            const v = p && p.data != null ? Number(p.data) : null
            const unit = p.seriesName === "Δ Speed" ? "" : " km/h"
            const val = v != null && Number.isFinite(v) ? `${Math.round(v)}${unit}` : "N/A"
            lines.push(`${p.marker || ""} ${p.seriesName}: ${val}`)
          }
          return lines.join("\n")
        }
      }

      const optionSpeed = {
        backgroundColor: "#000000",
        color: ["#3498db", "#f39c12", "#ffffff"],
        grid: { left: 18, right: 18, top: 20, bottom: 22, containLabel: true },
        tooltip: tooltipSpeed,
        legend: { data: ["A Speed", "B Speed", "Δ Speed"], textStyle: { color: "rgba(255,255,255,0.7)" } },
        xAxis: {
          type: "category",
          data: xLabels,
          axisLabel: { color: "rgba(255,255,255,0.55)", interval: 0 },
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
          axisTick: { show: false }
        },
        yAxis: [
          {
            type: "value",
            axisLabel: { color: "rgba(255,255,255,0.55)" },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
            axisLine: { show: false }
          },
          {
            type: "value",
            axisLabel: { color: "rgba(255,255,255,0.55)" },
            splitLine: { show: false },
            axisLine: { show: false }
          }
        ],
        series: [
          {
            name: "A Speed",
            type: "line",
            data: speedA,
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
          { name: "B Speed", type: "line", data: speedB, showSymbol: false, smooth: false, lineStyle: { width: 2 } },
          { name: "Δ Speed", type: "line", yAxisIndex: 1, data: deltaSpeed, showSymbol: false, smooth: false, lineStyle: { width: 1, type: "dashed" } }
        ]
      }

      const deltas = deltaSpeed.filter((v) => v != null && Number.isFinite(v))
      let kpiText = ""
      if (deltas.length) {
        const sum = deltas.reduce((acc, v) => acc + v, 0)
        const avg = sum / deltas.length
        const max = Math.max(...deltas)
        const min = Math.min(...deltas)
        kpiText = `ΔSpeed avg ${avg.toFixed(1)} · max ${max.toFixed(1)} · min ${min.toFixed(1)}`
      }

      this.setData({
        lapInfoA,
        lapInfoB,
        kpiText,
        chartOptionTB: optionTB,
        chartOptionSpeed: optionSpeed
      })
    })
  }
})
