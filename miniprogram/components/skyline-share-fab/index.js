function normalizeSize(v) {
  const s = String(v || "md").toLowerCase()
  if (s === "sm" || s === "md" || s === "lg") return s
  return "md"
}

function rpxToPx(rpx) {
  try {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync && wx.getSystemInfoSync())
    const sw = sys && sys.windowWidth ? Number(sys.windowWidth) : 375
    return (rpx / 750) * sw
  } catch (e) {
    return (rpx / 750) * 375
  }
}

function getWinSize() {
  try {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync && wx.getSystemInfoSync())
    if (!sys) return { w: 375, h: 667 }
    return {
      w: Number(sys.windowWidth) || 375,
      h: Number(sys.windowHeight) || 667
    }
  } catch (e) {
    return { w: 375, h: 667 }
  }
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

function sizeToPx(size) {
  const s = normalizeSize(size)
  if (s === "sm") return rpxToPx(80)
  if (s === "lg") return rpxToPx(140)
  return rpxToPx(104)
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

    autoResetOnShow: { type: Boolean, value: true },

    draggable: { type: Boolean, value: true },
    edgeInset: { type: Number, value: 8 },
    positionKey: { type: String, value: "skyline_share_fab_pos" }
  },
  data: {
    _visible: true,
    _dragging: false,
    _sizeClass: "size-md",
    _dragStyle: "",
    _shellStyle: "",
    _innerStyle: "",
    _contentStyle: "",
    _hasShareKey: false
  },
  lifetimes: {
    attached() {
      this._gsx = 0
      this._gsy = 0
      this._glx = 0
      this._gly = 0
      this._moved = false
      this._startedAt = 0
      this._dragState = null
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
    "size, right, left, top, bottom, closedBorderRadius, innerBg, innerBorder, innerShadow, glowColor, contentStyle, shareKey, draggable, edgeInset": function () {
      this._recomputeProps()
    }
  },
  methods: {
    _defaultAnchor() {
      const p = this.properties
      const size = sizeToPx(p.size)
      const win = getWinSize()
      let x = win.w - size - rpxToPx(20)
      let y = win.h - size - rpxToPx(260)
      const insets = this._safeInsets()
      x = win.w - size - rpxToPx(20)
      y = win.h - size - rpxToPx(260) - insets.bottom
      if (p.right) x = win.w - size - this._toPxOrZero(p.right)
      if (p.left) x = this._toPxOrZero(p.left)
      if (p.top) y = this._toPxOrZero(p.top)
      if (p.bottom) y = win.h - size - this._toPxOrZero(p.bottom) - insets.bottom
      return { x, y }
    },
    _safeInsets() {
      try {
        const sys = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync && wx.getSystemInfoSync())
        return {
          top: sys && sys.safeAreaInsets && sys.safeAreaInsets.top ? Number(sys.safeAreaInsets.top) : 0,
          bottom: sys && sys.safeAreaInsets && sys.safeAreaInsets.bottom ? Number(sys.safeAreaInsets.bottom) : 0
        }
      } catch (e) {
        return { top: 0, bottom: 0 }
      }
    },
    _toPxOrZero(v) {
      if (v == null) return 0
      const s = String(v).trim()
      const rMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*rpx$/)
      const pMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*px$/)
      const nMatch = s.match(/^(-?\d+(?:\.\d+)?)$/)
      if (rMatch) return rpxToPx(Number(rMatch[1]))
      if (pMatch) return Number(pMatch[1])
      if (nMatch) return Number(nMatch[1])
      return 0
    },
    _loadSavedPos() {
      const key = String(this.properties.positionKey || "skyline_share_fab_pos")
      try {
        const saved = wx.getStorageSync && wx.getStorageSync(key)
        if (!saved || typeof saved !== "object") return null
        const x = Number(saved.x)
        const y = Number(saved.y)
        if (!isFinite(x) || !isFinite(y)) return null
        return { x, y }
      } catch (e) {
        return null
      }
    },
    _savePos(pt) {
      const key = String(this.properties.positionKey || "skyline_share_fab_pos")
      try { wx.setStorageSync && wx.setStorageSync(key, { x: pt.x, y: pt.y }) } catch (e) {}
    },
    _clampPos(pt) {
      const size = sizeToPx(this.properties.size)
      const win = getWinSize()
      const insets = this._safeInsets()
      const inset = Number(this.properties.edgeInset) || 0
      const minX = inset
      const maxX = win.w - size - inset
      const minY = inset + insets.top
      const maxY = win.h - size - inset - insets.bottom
      let x = pt.x
      let y = pt.y
      if (x < minX) x = minX
      if (x > maxX) x = maxX
      if (y < minY) y = minY
      if (y > maxY) y = maxY
      return { x, y }
    },
    _snapX(pt) {
      const size = sizeToPx(this.properties.size)
      const win = getWinSize()
      const inset = Number(this.properties.edgeInset) || 0
      const leftX = inset
      const rightX = win.w - size - inset
      const center = (win.w - size) / 2
      let x = pt.x
      if (x < center) x = leftX
      else x = rightX
      return { x, y: pt.y }
    },
    _applyPos(pt, opts) {
      const clamped = this._clampPos(pt)
      const s = clamped
      const trans = opts && opts.snap !== false ? "transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);" : ""
      const dragStyle = `transform:translate3d(${s.x}px, ${s.y}px, 0);left:0;top:0;${trans}`
      this._lastPos = { x: s.x, y: s.y }
      this.setData({ _dragStyle: dragStyle })
      return { x: s.x, y: s.y }
    },
    _recomputeProps() {
      const p = this.properties
      const size = normalizeSize(p.size)
      const _hasShareKey = Boolean(String(p.shareKey || "").trim())
      if (!this._lastPos) {
        const saved = this._loadSavedPos()
        if (saved) this._lastPos = { x: saved.x, y: saved.y }
        else this._lastPos = this._defaultAnchor()
      }
      this._applyPos(this._lastPos, { snap: false })
      this.setData({
        _sizeClass: "size-" + size,
        _shellStyle: p.draggable ? "" : buildShellStyle(p),
        _innerStyle: buildInnerStyle(p),
        _contentStyle: buildContentStyle(size, p.contentStyle),
        _hasShareKey
      })
    },
    reset() {
      if (!this.data._visible) {
        this.setData({ _visible: true })
        this._lastPos = this._loadSavedPos() || this._defaultAnchor()
        this._applyPos(this._lastPos, { snap: false })
        return
      }
      this.setData({ _visible: false }, () => {
        wx.nextTick(() => {
          this._lastPos = this._loadSavedPos() || this._defaultAnchor()
          this.setData({ _visible: true }, () => this._applyPos(this._lastPos, { snap: false }))
        })
      })
    },
    _onTouchStart(e) {
      if (!this.properties.draggable) return
      const t = (e && e.touches && e.touches[0]) || null
      if (!t) return
      this._gsx = Number(t.pageX) || 0
      this._gsy = Number(t.pageY) || 0
      const last = this._lastPos || { x: 0, y: 0 }
      this._glx = last.x
      this._gly = last.y
      this._moved = false
      this._startedAt = Date.now()
      this.setData({ _dragging: false })
    },
    _onTouchMove(e) {
      if (!this.properties.draggable) return
      const t = (e && e.touches && e.touches[0]) || null
      if (!t) return
      const dx = (Number(t.pageX) || 0) - this._gsx
      const dy = (Number(t.pageY) || 0) - this._gsy
      if (!this._moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        this._moved = true
        this.setData({ _dragging: true })
      }
      if (this._moved) {
        const pt = { x: this._glx + dx, y: this._gly + dy }
        this._applyPos(pt, { snap: false })
      }
    },
    _onTouchEnd(e) {
      if (!this.properties.draggable) return
      const endX = (e && e.changedTouches && e.changedTouches[0] && Number(e.changedTouches[0].pageX)) || 0
      const endY = (e && e.changedTouches && e.changedTouches[0] && Number(e.changedTouches[0].pageY)) || 0
      if (!this._moved) {
        this.setData({ _dragging: false })
        const dt = Date.now() - this._startedAt
        if (dt < 420 && Math.hypot(endX - this._gsx, endY - this._gsy) < 12) {
          this._dragState = { wasClick: true }
        }
        return
      }
      const size = sizeToPx(this.properties.size)
      const win = getWinSize()
      const insets = this._safeInsets()
      const inset = Number(this.properties.edgeInset) || 0
      const raw = this._lastPos || this._defaultAnchor()
      const snapped = this._snapX(raw)
      const clamped = this._clampPos({
        x: Math.max(inset, Math.min(win.w - size - inset, snapped.x)),
        y: Math.max(inset + insets.top, Math.min(win.h - size - inset - insets.bottom, snapped.y))
      })
      this._applyPos(clamped, { snap: true })
      this._savePos(clamped)
      this._dragState = { wasClick: false }
      this.setData({ _dragging: false })
    },
    _onInnerTap() {
      if (this.properties.draggable) {
        const st = this._dragState
        this._dragState = null
        if (st && st.wasClick === false) return
      }
      this.triggerEvent("tap", {}, {})
      const url = String(this.properties.targetUrl || "").trim()
      if (!url) return
      const opts = { url }
      const ev = this.properties.targetEvents
      if (ev && typeof ev === "object") opts.events = ev
      opts.fail = () => {}
      opts.success = () => {}
      wx.navigateTo(opts)
    }
  }
})
