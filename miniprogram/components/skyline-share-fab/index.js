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
    if (!sys) return { w: 375, h: 667, screenH: 667 }
    const winH = Number(sys.windowHeight) || 667
    const screenH = Number(sys.screenHeight) || winH
    return {
      w: Number(sys.windowWidth) || 375,
      h: winH,
      screenH: screenH
    }
  } catch (e) {
    return { w: 375, h: 667, screenH: 667 }
  }
}

function buildInnerStyle(props) {
  const inner = []
  if (props.closedBorderRadius != null) inner.push(`border-radius:${props.closedBorderRadius}rpx;`)
  else inner.push("border-radius:999rpx;")
  let bg = ""
  if (props.innerBg) bg = props.innerBg
  else bg = "linear-gradient(180deg,rgba(20,20,28,0.92) 0%,rgba(10,10,16,0.98) 100%)"
  inner.push(`background:${bg};`)
  if (props.innerBorder) inner.push(`border:${props.innerBorder};`)
  else inner.push("border:1rpx solid rgba(124,203,255,0.3);")
  if (props.innerShadow) inner.push(`box-shadow:${props.innerShadow};`)
  else inner.push("box-shadow:inset 0 1rpx 0 rgba(255,255,255,0.18),0 14rpx 34rpx rgba(0,62,128,0.32);")
  const glow = String(props.glowColor || "").trim()
  if (glow) {
    inner.pop()
    inner.pop()
    inner.push(`box-shadow:
      0 0 0 12rpx ${glow} inset,
      ${props.innerShadow || "inset 0 1rpx 0 rgba(255,255,255,0.18),0 14rpx 34rpx rgba(0,62,128,0.32)"};`)
  }
  return inner.join("")
}

function buildContentStyle(size, contentStyle) {
  const extra = contentStyle ? String(contentStyle) : ""
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
    reserveBottomRpx: { type: Number, value: 0 },
    reserveTabbarPx: { type: Number, value: 50 },
    positionKey: { type: String, value: "skyline_share_fab_pos" }
  },
  data: {
    _visible: true,
    _dragging: false,
    _sizeClass: "size-md",
    _dragStyle: "",
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
      this._resetTimer = null
      this._rafPending = false
      this._rafX = 0
      this._rafY = 0
      this._lastPos = null
      this._recomputeProps()
      if (this.properties.autoResetOnShow) {
        this._onPageShow = () => {
          if (this._resetTimer) return
          this._resetTimer = setTimeout(() => {
            this._resetTimer = null
            this.reset()
          }, 140)
        }
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
      this._rafPending = false
      if (this._resetTimer) {
        clearTimeout(this._resetTimer)
        this._resetTimer = null
      }
    }
  },
  observers: {
    "size, right, left, top, bottom, closedBorderRadius, innerBg, innerBorder, innerShadow, glowColor, contentStyle, shareKey, draggable, edgeInset, reserveBottomRpx, reserveTabbarPx": function () {
      this._recomputeProps()
    }
  },
  methods: {
    _defaultAnchor() {
      const p = this.properties
      const sizePx = sizeToPx(p.size)
      const win = getWinSize()
      const insets = this._safeInsets()
      const reserve = rpxToPx(Number(p.reserveBottomRpx) || 0)
      const tabPx = Number(p.reserveTabbarPx) || 0
      let x = win.w - sizePx - rpxToPx(20)
      let y = win.h - sizePx - rpxToPx(260) - insets.bottom - reserve - tabPx
      if (p.right) x = win.w - sizePx - this._toPxOrZero(p.right)
      if (p.left) x = this._toPxOrZero(p.left)
      if (p.top) y = this._toPxOrZero(p.top)
      if (p.bottom) y = win.h - sizePx - this._toPxOrZero(p.bottom) - insets.bottom - reserve - tabPx
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
        if (x === 0 && y === 0) return null
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
      const sizePx = sizeToPx(this.properties.size)
      const win = getWinSize()
      const insets = this._safeInsets()
      const inset = Number(this.properties.edgeInset) || 0
      const reserve = rpxToPx(Number(this.properties.reserveBottomRpx) || 0)
      const tabPx = Number(this.properties.reserveTabbarPx) || 0
      const minX = inset
      const maxX = win.w - sizePx - inset
      const minY = inset + insets.top
      const winMaxY = win.h - sizePx - inset - insets.bottom - reserve - tabPx
      const screenMaxY = win.screenH - sizePx - inset - insets.bottom - reserve - tabPx
      const maxY = Math.min(winMaxY, screenMaxY)
      let x = pt.x
      let y = pt.y
      if (x < minX) x = minX
      if (x > maxX) x = maxX
      if (y < minY) y = minY
      if (y > maxY) y = maxY
      return { x, y }
    },
    _snapX(pt) {
      const sizePx = sizeToPx(this.properties.size)
      const win = getWinSize()
      const inset = Number(this.properties.edgeInset) || 0
      const leftX = inset
      const rightX = win.w - sizePx - inset
      const center = (win.w - sizePx) / 2
      let x = pt.x
      if (x < center) x = leftX
      else x = rightX
      return { x, y: pt.y }
    },
    _buildDragStyle(pt, withSnapAnim) {
      const s = pt
      const trans = withSnapAnim
        ? "transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);"
        : "transition: none;"
      return `position:fixed;left:0;top:0;transform:translate3d(${s.x}px, ${s.y}px, 0);${trans}`
    },
    _applyPos(pt, opts) {
      const clamped = this._clampPos(pt)
      const sn = opts && opts.snap !== false
      const needAnim = Boolean(sn) && this._lastPos
        && (Math.abs(clamped.x - this._lastPos.x) > 1 || Math.abs(clamped.y - this._lastPos.y) > 1)
      this._lastPos = { x: clamped.x, y: clamped.y }
      this.setData({ _dragStyle: this._buildDragStyle(clamped, needAnim) })
      return clamped
    },
    _applyPosFast(pt) {
      const clamped = this._clampPos(pt)
      if (this._lastPos
        && Math.abs(clamped.x - this._lastPos.x) < 0.5
        && Math.abs(clamped.y - this._lastPos.y) < 0.5) {
        return clamped
      }
      this._lastPos = { x: clamped.x, y: clamped.y }
      this.setData({ _dragStyle: this._buildDragStyle(clamped, false) })
      return clamped
    },
    _rafFlush() {
      if (!this._rafPending) return
      this._rafPending = false
      const x = this._rafX
      const y = this._rafY
      this._applyPosFast({ x, y })
    },
    _recomputeProps() {
      const p = this.properties
      const size = normalizeSize(p.size)
      const _hasShareKey = Boolean(String(p.shareKey || "").trim())
      this._lastPos = this._defaultAnchor()
      this._applyPos(this._lastPos, { snap: false })
      this.setData({
        _sizeClass: "size-" + size,
        _innerStyle: buildInnerStyle(p),
        _contentStyle: buildContentStyle(size, p.contentStyle),
        _hasShareKey
      })
    },
    reset() {
      if (!this.data._visible) {
        this.setData({ _visible: true })
        this._lastPos = null
        this._recomputeProps()
        return
      }
      this.setData({ _visible: false }, () => {
        wx.nextTick(() => {
          this._lastPos = null
          this.setData({ _visible: true }, () => this._recomputeProps())
        })
      })
    },
    _onTouchStart(e) {
      if (!this.properties.draggable) return
      const t = (e && e.touches && e.touches[0]) || null
      if (!t) return
      this._rafPending = false
      this._gsx = Number(t.pageX) || 0
      this._gsy = Number(t.pageY) || 0
      const last = this._lastPos || { x: 0, y: 0 }
      this._glx = last.x
      this._gly = last.y
      this._moved = false
      this._startedAt = Date.now()
      this._dragState = null
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
      const nx = this._glx + dx
      const ny = this._gly + dy
      this._rafX = nx
      this._rafY = ny
      if (this._rafPending) return
      this._rafPending = true
      const self = this
      setTimeout(() => self._rafFlush(), 16)
    },
    _onTouchEnd(e) {
      const endX = (e && e.changedTouches && e.changedTouches[0] && Number(e.changedTouches[0].pageX)) || 0
      const endY = (e && e.changedTouches && e.changedTouches[0] && Number(e.changedTouches[0].pageY)) || 0
      if (this._rafPending) {
        this._rafPending = false
        this._applyPosFast({ x: this._rafX, y: this._rafY })
      }
      if (!this._moved) {
        this.setData({ _dragging: false })
        const dt = Date.now() - this._startedAt
        if (dt < 420 && Math.hypot(endX - this._gsx, endY - this._gsy) < 12) {
          this._dragState = { wasClick: true, at: Date.now() }
        }
        return
      }
      if (!this.properties.draggable) return
      const sizePx = sizeToPx(this.properties.size)
      const win = getWinSize()
      const insets = this._safeInsets()
      const inset = Number(this.properties.edgeInset) || 0
      const reserve = rpxToPx(Number(this.properties.reserveBottomRpx) || 0)
      const tabPx = Number(this.properties.reserveTabbarPx) || 0
      const raw = this._lastPos || this._defaultAnchor()
      const snapped = this._snapX(raw)
      const winMaxY = win.h - sizePx - inset - insets.bottom - reserve - tabPx
      const screenMaxY = win.screenH - sizePx - inset - insets.bottom - reserve - tabPx
      const yMax = Math.min(winMaxY, screenMaxY)
      const clamped = this._clampPos({
        x: Math.max(inset, Math.min(win.w - sizePx - inset, snapped.x)),
        y: Math.max(inset + insets.top, Math.min(yMax, snapped.y))
      })
      const finalPt = this._applyPos(clamped, { snap: true })
      this._dragState = { wasClick: false, at: Date.now() }
      this.setData({ _dragging: false })
    },
    _onDragTap(e) {
      if (!this.properties.draggable) {
        this._executeNavigate()
        return
      }
      const st = this._dragState
      this._dragState = null
      if (st && st.wasClick === false) return
      this._executeNavigate()
    },
    _executeNavigate() {
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
