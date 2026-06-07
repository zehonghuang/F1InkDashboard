function clamp01(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function normColor(v, fallback) {
  const s = String(v || "").trim()
  return s ? s : fallback
}

function buildTicks() {
  const out = []
  for (let i = 0; i < 60; i++) out.push({ i, deg: i * 6, major: i % 5 === 0 })
  return out
}

function buildStatic({ sizeRpx, accent, tickAlpha }) {
  const s = Math.max(48, Math.floor(Number(sizeRpx) || 0))
  const a = clamp01(tickAlpha)
  const accentColor = normColor(accent, "#E10600")

  const ringPad = Math.max(2, Math.floor(s * 0.06))
  const faceBorder = Math.max(1, Math.floor(s * 0.02))
  const tickRadius = Math.floor(s * 0.38)
  const tickMajorLen = Math.max(6, Math.floor(s * 0.10))
  const tickMinorLen = Math.max(3, Math.floor(s * 0.06))
  const tickThick = Math.max(1, Math.floor(s * 0.02))

  const hourLen = Math.max(10, Math.floor(s * 0.22))
  const minLen = Math.max(12, Math.floor(s * 0.30))
  const secLen = Math.max(14, Math.floor(s * 0.34))

  const hourThick = Math.max(3, Math.floor(s * 0.06))
  const minThick = Math.max(2, Math.floor(s * 0.04))
  const secThick = Math.max(1, Math.floor(s * 0.02))

  const capOuter = Math.max(4, Math.floor(s * 0.07)) * 2
  const capInner = Math.max(2, Math.floor(s * 0.035)) * 2

  const ringStyle = `width:${s}rpx;height:${s}rpx;border-radius:${s}rpx;padding:${ringPad}rpx;background:rgba(225,6,0,0.18);`
  const faceStyle = `width:${s}rpx;height:${s}rpx;border-radius:${s}rpx;border:${faceBorder}rpx solid rgba(255,255,255,0.16);background:linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.66) 100%);`

  const majorColor = `rgba(255,255,255,${Math.max(0.4, a)})`
  const minorColor = `rgba(255,255,255,${Math.max(0.18, a * 0.55)})`
  const tickMajorStyle = `width:${tickMajorLen}rpx;height:${tickThick}rpx;border-radius:${tickThick}rpx;background:${majorColor};`
  const tickMinorStyle = `width:${tickMinorLen}rpx;height:${tickThick}rpx;border-radius:${tickThick}rpx;background:${minorColor};`

  const hourLineStyle = `width:${hourLen}rpx;height:${hourThick}rpx;border-radius:${hourThick}rpx;background:rgba(255,255,255,0.90);`
  const minuteLineStyle = `width:${minLen}rpx;height:${minThick}rpx;border-radius:${minThick}rpx;background:rgba(255,255,255,0.78);`
  const secondLineStyle = `width:${secLen}rpx;height:${secThick}rpx;border-radius:${secThick}rpx;background:${accentColor};`

  const capOuterStyle = `width:${capOuter}rpx;height:${capOuter}rpx;border-radius:${capOuter}rpx;background:rgba(255,255,255,0.90);`
  const capInnerStyle = `width:${capInner}rpx;height:${capInner}rpx;border-radius:${capInner}rpx;background:rgba(0,0,0,0.75);`

  const tickItems = buildTicks().map((t) => ({
    i: t.i,
    major: t.major,
    style: `transform: translate(-50%, -50%) rotate(${t.deg}deg) translateX(${tickRadius}rpx);`
  }))

  return {
    ringStyle,
    faceStyle,
    tickItems,
    tickMajorStyle,
    tickMinorStyle,
    hourLineStyle,
    minuteLineStyle,
    secondLineStyle,
    capOuterStyle,
    capInnerStyle
  }
}

function buildHandTransform(deg) {
  const d = Number(deg)
  const v = Number.isFinite(d) ? d : -90
  return `transform: translate(-50%, -50%) rotate(${v}deg);`
}

Component({
  properties: {
    sizeRpx: { type: Number, value: 84 },
    accent: { type: String, value: "#E10600" },
    tickAlpha: { type: Number, value: 0.55 }
  },
  data: {
    ringStyle: "",
    faceStyle: "",
    tickItems: [],
    tickMajorStyle: "",
    tickMinorStyle: "",
    hourLineStyle: "",
    minuteLineStyle: "",
    secondLineStyle: "",
    capOuterStyle: "",
    capInnerStyle: "",
    hourHandStyle: buildHandTransform(-90),
    minuteHandStyle: buildHandTransform(-90),
    secondHandStyle: buildHandTransform(-90)
  },
  observers: {
    sizeRpx() {
      this.rebuildStatic()
    },
    accent() {
      this.rebuildStatic()
    },
    tickAlpha() {
      this.rebuildStatic()
    }
  },
  lifetimes: {
    attached() {
      this.rebuildStatic()
      this._alive = true
      this.tick()
    },
    detached() {
      this._alive = false
      clearTimeout(this._t)
      this._t = null
    }
  },
  methods: {
    rebuildStatic() {
      const st = buildStatic({
        sizeRpx: this.data.sizeRpx,
        accent: this.data.accent,
        tickAlpha: this.data.tickAlpha
      })
      this.setData(st)
    },
    tick() {
      if (!this._alive) return
      const d = new Date()
      const h0 = d.getHours()
      const m0 = d.getMinutes()
      const s0 = d.getSeconds()
      const ms = d.getMilliseconds()
      const hourDeg = (h0 % 12) * 30 + m0 * 0.5 + s0 * (0.5 / 60) - 90
      const minuteDeg = m0 * 6 + s0 * 0.1 - 90
      const secondDeg = s0 * 6 - 90
      this.setData({
        hourHandStyle: buildHandTransform(hourDeg),
        minuteHandStyle: buildHandTransform(minuteDeg),
        secondHandStyle: buildHandTransform(secondDeg)
      })
      const delay = Math.max(16, 1000 - ms)
      clearTimeout(this._t)
      this._t = setTimeout(() => this.tick(), delay)
    }
  }
})

