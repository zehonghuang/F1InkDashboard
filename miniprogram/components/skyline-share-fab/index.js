function normalizeSize(v) {
  const s = String(v || "md").toLowerCase()
  if (s === "sm" || s === "md" || s === "lg") return s
  return "md"
}

function buildShellStyle(props) {
  const parts = []
  if (props.right != null) parts.push(`right:${props.right};`)
  else parts.push("right:20rpx;")
  if (props.left != null) parts.push(`left:${props.left};`)
  if (props.bottom != null) parts.push(`bottom:calc(${props.bottom} + env(safe-area-inset-bottom));`)
  else parts.push("bottom:calc(260rpx + env(safe-area-inset-bottom));")
  if (props.top != null) parts.push(`top:${props.top};`)
  return parts.join("")
}

function buildInnerStyle(props) {
  const inner = []
  if (props.closedBorderRadius != null) inner.push(`border-radius:${props.closedBorderRadius}rpx;`)
  else inner.push("border-radius:999rpx;")
  if (props.innerBg) inner.push(`background:${props.innerBg};`)
  else inner.push("background:linear-gradient(180deg,rgba(20,20,28,0.92) 0%,rgba(10,10,16,0.98) 100%);")
  if (props.innerBorder) inner.push(`border:${props.innerBorder};`)
  else inner.push("border:1rpx solid rgba(124,203,255,0.3);")
  if (props.innerShadow) inner.push(`box-shadow:${props.innerShadow};`)
  else inner.push("box-shadow:inset 0 1rpx 0 rgba(255,255,255,0.18),0 14rpx 34rpx rgba(0,62,128,0.32);")
  const glow = String(props.glowColor || "rgba(92,188,255,0.36)").trim()
  if (glow) {
    inner.push(`background:
      radial-gradient(circle at 30% 28%, ${glow} 0%, rgba(92,188,255,0.08) 24%, rgba(92,188,255,0) 44%),
      ${props.innerBg || "linear-gradient(180deg,rgba(20,20,28,0.92) 0%,rgba(10,10,16,0.98) 100%)"};`)
  }
  return inner.join("")
}

function buildContentStyle(size, contentStyle) {
  const extra = contentStyle ? String(contentStyle) : ""
  if (size === "sm") return extra
  if (size === "lg") return extra
  return extra
}

Component({
  options: {
    multipleSlots: true
  },
  properties: {
    targetUrl: { type: String, value: "" },
    targetEvents: { type: Object, value: null },
    shareKey: { type: String, value: "" },
    src: { type: String, value: "" },
    imageMode: { type: String, value: "aspectFit" },
    fallbackText: { type: String, value: "✦" },
    useSlot: { type: Boolean, value: false },
    contentStyle: { type: String, value: "" },

    size: { type: String, value: "md" },
    right: { type: String, value: "" },
    left: { type: String, value: "" },
    top: { type: String, value: "" },
    bottom: { type: String, value: "" },

    ping: { type: Boolean, value: true },
    glowColor: { type: String, value: "rgba(92,188,255,0.36)" },
    innerBg: { type: String, value: "" },
    innerBorder: { type: String, value: "" },
    innerShadow: { type: String, value: "" },

    closedColor: { type: String, value: "rgba(20, 20, 28, 0.98)" },
    closedElevation: { type: Number, value: 28 },
    closedBorderRadius: { type: Number, value: 999 },
    openColor: { type: String, value: "#15151e" },
    openElevation: { type: Number, value: 0 },
    openBorderRadius: { type: Number, value: 0 },
    transitionType: { type: String, value: "fadeThrough" },
    transitionDuration: { type: Number, value: 380 },

    transitionOnGesture: { type: Boolean, value: true },
    rectTweenType: { type: String, value: "materialRectArc" },
    shuttleOnPush: { type: String, value: "to" },
    shuttleOnPop: { type: String, value: "to" },

    autoResetOnShow: { type: Boolean, value: true }
  },
  data: {
    _visible: true,
    _sizeClass: "size-md",
    _shellStyle: "",
    _innerStyle: "",
    _contentStyle: "",
    _hasShareKey: false
  },
  lifetimes: {
    attached() {
      this._recomputeProps()
      if (this.properties.autoResetOnShow) {
        this._onPageShow = () => this.reset()
        const pages = getCurrentPages && getCurrentPages()
        const page = pages && pages[pages.length - 1]
        if (page && typeof page.onShow === "function") {
          const orig = page.onShow.bind(page)
          const self = this
          page.onShow = function () {
            try { orig.apply(this, arguments) } catch (e) {}
            try { self._onPageShow && self._onPageShow() } catch (e) {}
          }
        }
      }
    },
    detached() {
      this._onPageShow = null
    }
  },
  observers: {
    "size, right, left, top, bottom, closedBorderRadius, innerBg, innerBorder, innerShadow, glowColor, contentStyle, shareKey": function () {
      this._recomputeProps()
    }
  },
  methods: {
    _recomputeProps() {
      const p = this.properties
      const size = normalizeSize(p.size)
      const _hasShareKey = Boolean(String(p.shareKey || "").trim())
      this.setData({
        _sizeClass: "size-" + size,
        _shellStyle: buildShellStyle(p),
        _innerStyle: buildInnerStyle(p),
        _contentStyle: buildContentStyle(size, p.contentStyle),
        _hasShareKey
      })
    },
    reset() {
      if (!this.data._visible) {
        this.setData({ _visible: true })
        return
      }
      this.setData({ _visible: false }, () => {
        wx.nextTick(() => {
          this.setData({ _visible: true })
        })
      })
    },
    _onTap() {
      this.triggerEvent("tap", {}, {})
      const url = String(this.properties.targetUrl || "").trim()
      if (!url) return
      const opts = { url }
      const ev = this.properties.targetEvents
      if (ev && typeof ev === "object") opts.events = ev
      const self = this
      opts.fail = () => {}
      opts.success = () => {}
      wx.navigateTo(opts)
    }
  }
})
