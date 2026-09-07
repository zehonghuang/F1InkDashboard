const FACE_IMG = "/assets/clock/tag-face.png"
const HOUR_IMG = "/assets/clock/tag-hour.png"
const MINUTE_IMG = "/assets/clock/tag-minute.png"
const SECOND_IMG = "/assets/clock/tag-second.png"

function buildStatic({ sizeRpx }) {
  const s = Math.max(48, Math.floor(Number(sizeRpx) || 0))
  const containerStyle = `width:${s}rpx;height:${s}rpx;`
  const faceStyle = `width:${s}rpx;height:${s}rpx;border-radius:${s}rpx;`
  return {
    faceImgSrc: FACE_IMG,
    hourImgSrc: HOUR_IMG,
    minuteImgSrc: MINUTE_IMG,
    secondImgSrc: SECOND_IMG,
    containerStyle,
    faceStyle
  }
}

function buildHandStyle(deg) {
  const d = Number(deg)
  const v = Number.isFinite(d) ? d : 0
  return `transform:rotate(${v}deg);`
}

Component({
  properties: {
    sizeRpx: { type: Number, value: 84 },
    accent: { type: String, value: "#E10600" },
    tickAlpha: { type: Number, value: 0.55 }
  },
  data: {
    faceImgSrc: FACE_IMG,
    hourImgSrc: HOUR_IMG,
    minuteImgSrc: MINUTE_IMG,
    secondImgSrc: SECOND_IMG,
    containerStyle: "",
    faceStyle: "",
    hourHandStyle: buildHandStyle(0),
    minuteHandStyle: buildHandStyle(0),
    secondHandStyle: buildHandStyle(0)
  },
  observers: {
    sizeRpx() {
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
      const st = buildStatic({ sizeRpx: this.data.sizeRpx })
      this.setData(st, () => {
        this.tick(true)
      })
    },
    tick(force) {
      if (!this._alive && !force) return
      const d = new Date()
      const h0 = d.getHours()
      const m0 = d.getMinutes()
      const s0 = d.getSeconds()
      const ms = d.getMilliseconds()
      const hourDeg = (h0 % 12) * 30 + m0 * 0.5 + s0 * (0.5 / 60)
      const minuteDeg = m0 * 6 + s0 * 0.1
      const secondDeg = s0 * 6
      this.setData({
        hourHandStyle: buildHandStyle(hourDeg),
        minuteHandStyle: buildHandStyle(minuteDeg),
        secondHandStyle: buildHandStyle(secondDeg)
      })
      if (!this._alive) return
      const delay = Math.max(16, 1000 - ms)
      clearTimeout(this._t)
      this._t = setTimeout(() => this.tick(), delay)
    }
  }
})
