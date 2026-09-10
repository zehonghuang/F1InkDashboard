function normalizeSize(v) {
  const s = String(v || "md").toLowerCase()
  if (s === "sm" || s === "md" || s === "lg") return s
  return "md"
}

function normalizeShape(v, aspectRatio) {
  const s = String(v || "auto").toLowerCase()
  if (s === "circle" || s === "rect") return s
  const ratio = Number(aspectRatio) || 0
  return ratio > 0 ? "rect" : "circle"
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

function sizeEdgeRpx(size, explicitSizeRpx) {
  const custom = Number(explicitSizeRpx) || 0
  if (custom > 0) return Math.round(custom)
  const s = normalizeSize(size)
  if (s === "sm") return 80
  if (s === "lg") return 140
  return 104
}

function sizeToPxWH(size, explicitSizeRpx, shape, aspectRatio) {
  const edgeRpx = sizeEdgeRpx(size, explicitSizeRpx)
  const edgePx = rpxToPx(edgeRpx)
  const sh = normalizeShape(shape, aspectRatio)
  if (sh === "circle") {
    return { w: edgePx, h: edgePx }
  }
  const ratio = Number(aspectRatio) || 0
  if (ratio <= 0) {
    return { w: edgePx, h: edgePx }
  }
  if (ratio >= 1) {
    const w = edgePx
    const h = Math.max(20, edgePx / ratio)
    return { w, h }
  }
  const h = edgePx
  const w = Math.max(20, edgePx * ratio)
  return { w, h }
}

function deriveClosedBorderRadiusRpx(size, shape, aspectRatio, rectBorderRadius, explicitClosedBorderRadius) {
  if (explicitClosedBorderRadius != null && Number.isFinite(Number(explicitClosedBorderRadius))) {
    return Number(explicitClosedBorderRadius)
  }
  const sh = normalizeShape(shape, aspectRatio)
  if (sh === "circle") {
    return Math.round(sizeEdgeRpx(size) / 2)
  }
  const r = Number(rectBorderRadius)
  return Number.isFinite(r) && r >= 0 ? r : 20
}

function buildInnerStyle(props, shape, closedBorderRadiusRpx) {
  const inner = []
  const sh = normalizeShape(shape, props.aspectRatio)
  inner.push(`border-radius:${closedBorderRadiusRpx}rpx;`)
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

function buildContentStyle(size, explicitSizeRpx, contentStyle, shape, aspectRatio) {
  const extra = contentStyle ? String(contentStyle) : ""
  const sh = normalizeShape(shape, aspectRatio)
  if (sh === "circle") return extra
  const ratio = Number(aspectRatio) || 0
  if (ratio <= 0) return extra
  const edgeRpx = sizeEdgeRpx(size, explicitSizeRpx)
  let wRpx, hRpx
  if (ratio >= 1) {
    wRpx = edgeRpx
    hRpx = Math.max(20, Math.round(edgeRpx / ratio))
  } else {
    hRpx = edgeRpx
    wRpx = Math.max(20, Math.round(edgeRpx * ratio))
  }
  const dims = `width:${wRpx}rpx;height:${hRpx}rpx;max-width:100%;max-height:100%;`
  return dims + extra
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
    sizeRpx: { type: Number, value: 0 },
    shape: { type: String, value: "auto" },
    aspectRatio: { type: Number, value: 0 },
    rectBorderRadius: { type: Number, value: 20 },
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
    closedBorderRadius: { type: Number, value: null },
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
    dismissChip: { type: Boolean, value: true },
    dismissTtlMs: { type: Number, value: 604800000 },
    chipColor: { type: String, value: "rgba(220,38,38,0.96)" },
    chipIconColor: { type: String, value: "#ffffff" },

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
    _shapeClass: "shape-circle",
    _dragStyle: "",
    _innerStyle: "",
    _contentStyle: "",
    _pingStyle: "",
    _hasShareKey: false,
    _boxStyle: "",
    _closedBorderRadius: null
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
      this._lastSize = null
      this._lastShape = null
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
    "size, sizeRpx, shape, aspectRatio, rectBorderRadius, right, left, top, bottom, closedBorderRadius, innerBg, innerBorder, innerShadow, glowColor, contentStyle, shareKey, draggable, edgeInset, reserveBottomRpx, reserveTabbarPx, chipColor, chipIconColor, dismissChip, dismissTtlMs": function () {
      this._recomputeProps()
    }
  },
  methods: {
    _resolveShape() {
      return normalizeShape(this.properties.shape, this.properties.aspectRatio)
    },
    _sizeWH() {
      const sh = this._resolveShape()
      return sizeToPxWH(this.properties.size, this.properties.sizeRpx, sh, this.properties.aspectRatio)
    },
    _defaultAnchor() {
      const p = this.properties
      const sz = this._sizeWH()
      const win = getWinSize()
      const insets = this._safeInsets()
      const reserve = rpxToPx(Number(p.reserveBottomRpx) || 0)
      const tabPx = Number(p.reserveTabbarPx) || 0
      let x = win.w - sz.w - rpxToPx(20)
      let y = win.h - sz.h - rpxToPx(260) - insets.bottom - reserve - tabPx
      if (p.right) x = win.w - sz.w - this._toPxOrZero(p.right)
      if (p.left) x = this._toPxOrZero(p.left)
      if (p.top) y = this._toPxOrZero(p.top)
      if (p.bottom) y = win.h - sz.h - this._toPxOrZero(p.bottom) - insets.bottom - reserve - tabPx
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
      const key = String(this.properties.positionKey || "").trim()
      if (!key) return null
      try {
        const raw = wx.getStorageSync(key)
        if (!raw) return null
        if (typeof raw !== "object") return null
        const x = Number(raw.x)
        const y = Number(raw.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        if (x === 0 && y === 0) return null
        return { x, y }
      } catch (e) {
        return null
      }
    },
    _savePos(pt) {
      try {
        const key = String(this.properties.positionKey || "").trim()
        if (!key) return
        wx.setStorageSync(key, {
          x: pt.x,
          y: pt.y,
          savedAt: Date.now()
        })
      } catch (e) {}
    },
    _clampPos(pt) {
      const sz = this._sizeWH()
      const win = getWinSize()
      const insets = this._safeInsets()
      const inset = Number(this.properties.edgeInset) || 0
      const reserve = rpxToPx(Number(this.properties.reserveBottomRpx) || 0)
      const tabPx = Number(this.properties.reserveTabbarPx) || 0
      const minX = inset
      const maxX = win.w - sz.w - inset
      const minY = inset + insets.top
      const winMaxY = win.h - sz.h - inset - insets.bottom - reserve - tabPx
      const screenMaxY = win.screenH - sz.h - inset - insets.bottom - reserve - tabPx
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
      const sz = this._sizeWH()
      const win = getWinSize()
      const inset = Number(this.properties.edgeInset) || 0
      const leftX = inset
      const rightX = win.w - sz.w - inset
      const center = (win.w - sz.w) / 2
      let x = pt.x
      if (x < center) x = leftX
      else x = rightX
      return { x, y: pt.y }
    },
    _boxDimStyle(closedBorderRadiusRpx) {
      const sh = this._resolveShape()
      const sz = this._sizeWH()
      return `width:${Math.round(sz.w)}px;height:${Math.round(sz.h)}px;border-radius:${closedBorderRadiusRpx}rpx;`
    },
    _buildDragStyle(pt, withSnapAnim, extra, closedBorderRadiusRpx) {
      const s = pt
      let trans = "transition: none;"
      if (withSnapAnim) trans = "transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);"
      else if (extra && extra.transition) trans = `transition: ${extra.transition};`
      const box = this._boxDimStyle(closedBorderRadiusRpx)
      return `position:fixed;left:0;top:0;transform:translate3d(${s.x}px, ${s.y}px, 0);${trans}${box ? box : ""}`
    },
    _applyPos(pt, opts, closedBorderRadiusRpx) {
      const clamped = this._clampPos(pt)
      const sn = opts && opts.snap !== false
      const needAnim = Boolean(sn) && this._lastPos
        && (Math.abs(clamped.x - this._lastPos.x) > 1 || Math.abs(clamped.y - this._lastPos.y) > 1)
      this._lastPos = { x: clamped.x, y: clamped.y }
      this.setData({ _dragStyle: this._buildDragStyle(clamped, needAnim, opts && opts.extra, closedBorderRadiusRpx) })
      return clamped
    },
    _applyPosFast(pt, closedBorderRadiusRpx) {
      this._lastPos = { x: pt.x, y: pt.y }
      this.setData({ _dragStyle: this._buildDragStyle(pt, false, null, closedBorderRadiusRpx) })
      return pt
    },
    _rafFlush() {
      if (!this._rafPending) return
      this._rafPending = false
      const x = this._rafX
      const y = this._rafY
      const sh = this._resolveShape()
      const cbr = deriveClosedBorderRadiusRpx(this.properties.size, sh, this.properties.aspectRatio, this.properties.rectBorderRadius, this.properties.closedBorderRadius)
      this._applyPosFast({ x, y }, cbr)
    },
    _chipStyle() {
      const bg = String(this.properties.chipColor || "rgba(220,38,38,0.96)").trim()
      const fg = String(this.properties.chipIconColor || "#ffffff").trim()
      return `background:${bg};color:${fg};box-shadow:0 4rpx 14rpx rgba(0,0,0,0.28);`
    },
    _computeDismissed() {
      const key = String(this.properties.positionKey || "skyline_share_fab_pos")
      try {
        const saved = wx.getStorageSync && wx.getStorageSync(key)
        if (!saved || typeof saved !== "object") return false
        const at = Number(saved.dismissedAt) || 0
        const ttl = Number(this.properties.dismissTtlMs) || 0
        if (!at) return false
        if (ttl <= 0) return true
        if (Date.now() - at < ttl) return true
        try { wx.removeStorageSync && wx.removeStorageSync(key) } catch (e) {}
        return false
      } catch (e) {
        return false
      }
    },
    _markDismissed() {
      const key = String(this.properties.positionKey || "skyline_share_fab_pos")
      const last = this._lastPos || { x: 0, y: 0 }
      try { wx.setStorageSync && wx.setStorageSync(key, { x: last.x, y: last.y, dismissedAt: Date.now() }) } catch (e) {}
    },
    _recomputeProps() {
      const p = this.properties
      const size = normalizeSize(p.size)
      const sh = normalizeShape(p.shape, p.aspectRatio)
      const _hasShareKey = Boolean(String(p.shareKey || "").trim())
      if (this._computeDismissed()) {
        this.setData({ _visible: false })
        return
      }
      const cbr = deriveClosedBorderRadiusRpx(size, sh, p.aspectRatio, p.rectBorderRadius, p.closedBorderRadius)
      const sz = sizeToPxWH(size, p.sizeRpx, sh, p.aspectRatio)
      const shapeChanged = this._lastShape !== sh
      const sizeChanged = !this._lastSize
        || this._lastSize.w !== sz.w
        || this._lastSize.h !== sz.h
      this._lastShape = sh
      this._lastSize = sz
      const saved = this._loadSavedPos()
      let pt
      if (!shapeChanged && !sizeChanged && saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        && !(saved.x === 0 && saved.y === 0)) {
        pt = this._clampPos(saved)
      } else {
        pt = this._defaultAnchor()
      }
      this._lastPos = pt
      this._applyPos(pt, { snap: false }, cbr)
      const edgeRpx = sizeEdgeRpx(size, p.sizeRpx)
      const ratio = Number(p.aspectRatio) || 0
      let pwRpx = edgeRpx
      let phRpx = edgeRpx
      if (sh === "rect" && ratio > 0) {
        if (ratio >= 1) {
          pwRpx = edgeRpx
          phRpx = Math.max(20, Math.round(edgeRpx / ratio))
        } else {
          phRpx = edgeRpx
          pwRpx = Math.max(20, Math.round(edgeRpx * ratio))
        }
      }
      const _pingStyle = `width:${pwRpx}rpx;height:${phRpx}rpx;margin-left:-${Math.round(pwRpx / 2)}rpx;margin-top:-${Math.round(phRpx / 2)}rpx;border-radius:${cbr}rpx;`
      this.setData({
        _visible: true,
        _sizeClass: "size-" + size,
        _shapeClass: "shape-" + sh,
        _innerStyle: buildInnerStyle(p, sh, cbr),
        _contentStyle: buildContentStyle(size, p.sizeRpx, p.contentStyle, sh, p.aspectRatio),
        _pingStyle,
        _chipStyle: this._chipStyle(),
        _hasShareKey,
        _closedBorderRadius: cbr
      })
    },
    reset() {
      if (!this.data._visible) {
        this.setData({ _visible: true })
        this._lastPos = null
        this._lastSize = null
        this._lastShape = null
        this._recomputeProps()
        return
      }
      this.setData({ _visible: false }, () => {
        wx.nextTick(() => {
          this._lastPos = null
          this._lastSize = null
          this._lastShape = null
          this.setData({ _visible: true }, () => this._recomputeProps())
        })
      })
    },
    dismiss() {
      this._markDismissed()
      this.setData({ _visible: false })
      this.triggerEvent("close", {
        action: "dismiss",
        position: this._lastPos || { x: 0, y: 0 }
      })
    },
    _onChipTap(e) {
      if (e) {
        if (typeof e.stopPropagation === "function") try { e.stopPropagation() } catch (err) {}
        if (typeof e.preventDefault === "function") try { e.preventDefault() } catch (err) {}
      }
      this.dismiss()
    },
    _onDragTap(e) {
      if (!this.data._visible) return
      if (!this.properties.draggable) {
        this._executeNavigate()
        return
      }
      const st = this._dragState
      this._dragState = null
      if (st && st.wasClick === false) {
        if (this._lastPos) this._savePos(this._lastPos)
        return
      }
      this._executeNavigate()
    },
    _onTouchStart(e) {
      if (!this.properties.draggable) return
      const t = (e && e.touches && e.touches[0]) || null
      if (!t) return
      this._rafPending = false
      this._gsx = Number(t.pageX) || 0
      this._gsy = Number(t.pageY) || 0
      const last = this._lastPos || this._defaultAnchor()
      this._glx = last.x
      this._gly = last.y
      this._moved = false
      this._startedAt = Date.now()
      this._dragState = null
      this.setData({ _dragging: true })
    },
    _onTouchMove(e) {
      if (!this.properties.draggable) return
      const t = (e && e.touches && e.touches[0]) || null
      if (!t) return
      const dx = (Number(t.pageX) || 0) - this._gsx
      const dy = (Number(t.pageY) || 0) - this._gsy
      if (!this._moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        this._moved = true
      }
      this._rafX = this._glx + dx
      this._rafY = this._gly + dy
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
        const sh = this._resolveShape()
        const cbr = deriveClosedBorderRadiusRpx(this.properties.size, sh, this.properties.aspectRatio, this.properties.rectBorderRadius, this.properties.closedBorderRadius)
        this._applyPosFast({ x: this._rafX, y: this._rafY }, cbr)
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
      const raw = this._lastPos || this._defaultAnchor()
      const snapped = this._snapX(raw)
      const clamped = this._clampPos(snapped)
      const sh = this._resolveShape()
      const cbr = deriveClosedBorderRadiusRpx(this.properties.size, sh, this.properties.aspectRatio, this.properties.rectBorderRadius, this.properties.closedBorderRadius)
      const finalPt = this._applyPos(clamped, { snap: true }, cbr)
      this._savePos(finalPt)
      this._dragState = { wasClick: false, at: Date.now() }
      this.setData({ _dragging: false })
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
