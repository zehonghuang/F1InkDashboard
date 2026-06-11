function normalizeGalleryIndex(index, total) {
  const t = Math.max(0, Number(total) || 0)
  if (!t) return 0
  let i = Number(index) || 0
  while (i < 0) i += t
  return i % t
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function normalizeImages(images) {
  const list = Array.isArray(images) ? images : []
  return list
    .map((it) => ({
      src: String(it && it.src || "").trim(),
      alt: String(it && it.alt || "").trim()
    }))
    .filter((it) => it.src)
}

const IMAGE_META_CACHE = Object.create(null)
const VIEWER_MOVE_FRAME_MS = 16
const VIEWER_MOVE_EPSILON = 2
const VIEWER_AXIS_LOCK_DISTANCE = 8
const VIEWER_PREFETCH_OFFSETS = [0, 1, 2, -1]
const VIEWER_RIGHT_DRAG_DAMPING = 0.35
const VIEWER_RIGHT_DRAG_MAX_RATIO = 0.18

function fitViewerImageBox(meta, maxWidth, maxHeight) {
  const mw = Math.max(1, Number(maxWidth) || 320)
  const mh = Math.max(1, Number(maxHeight) || 520)
  const iw = Math.max(1, Number(meta && meta.width) || mw)
  const ih = Math.max(1, Number(meta && meta.height) || mh)
  const scale = Math.min(mw / iw, mh / ih)
  return {
    width: Math.max(1, Math.round(iw * scale)),
    height: Math.max(1, Math.round(ih * scale))
  }
}

function buildViewerBoxStyle(meta, maxWidth, maxHeight) {
  const box = fitViewerImageBox(meta, maxWidth, maxHeight)
  return `width:${box.width}px;height:${box.height}px;`
}

function buildViewerStackSlots(images, activeIndex, imageMeta, maxWidth, maxHeight) {
  const list = normalizeImages(images)
  const total = list.length
  const out = {
    mid: null,
    back: null,
    bottom: null
  }
  if (total > 1) {
    const mid = list[normalizeGalleryIndex(activeIndex + 1, total)]
    out.mid = {
      src: mid.src,
      alt: mid.alt || "",
      boxStyle: buildViewerBoxStyle(imageMeta && imageMeta[mid.src], maxWidth, maxHeight)
    }
  }
  if (total > 2) {
    const back = list[normalizeGalleryIndex(activeIndex + 2, total)]
    out.back = {
      src: back.src,
      alt: back.alt || "",
      boxStyle: buildViewerBoxStyle(imageMeta && imageMeta[back.src], maxWidth, maxHeight)
    }
  }
  if (total > 2) {
    const bottom = list[normalizeGalleryIndex(activeIndex + 3, total)]
    out.bottom = {
      src: bottom.src,
      alt: bottom.alt || "",
      boxStyle: buildViewerBoxStyle(imageMeta && imageMeta[bottom.src], maxWidth, maxHeight)
    }
  }
  return out
}

function buildViewerDeck(images, activeIndex, imageMeta, maxWidth, maxHeight) {
  const list = normalizeImages(images)
  const total = list.length
  const index = normalizeGalleryIndex(activeIndex, total)
  const frontImage = total ? list[index] : null
  return {
    frontImage,
    frontBoxStyle: frontImage ? buildViewerBoxStyle(imageMeta && imageMeta[frontImage.src], maxWidth, maxHeight) : "",
    stackSlots: buildViewerStackSlots(list, index, imageMeta, maxWidth, maxHeight),
    index,
    countText: `${index + 1} / ${total}`
  }
}

function buildViewerDragStyles({ dx, dy, width, direction, animated }) {
  const w = Math.max(1, Number(width) || 320)
  const x = Number(dx) || 0
  const y = Number(dy) || 0
  const progress = clamp(Math.abs(x) / Math.max(90, w * 0.32), 0, 1)
  const nextProgress = direction === "next" ? progress : 0
  const prevProgress = direction === "prev" ? progress : 0
  const rotate = clamp(x / 18, -12, 12)
  const verticalOffset = clamp(y * 0.12, -10, 10)
  const transition = animated
    ? "transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out;"
    : "transition: none;"
  const midX = direction === "next"
    ? lerp(42, 0, nextProgress)
    : lerp(42, 50, prevProgress)
  const backX = direction === "next"
    ? lerp(82, 42, nextProgress)
    : lerp(82, 88, prevProgress)
  const bottomX = direction === "next"
    ? lerp(112, 82, nextProgress)
    : lerp(112, 118, prevProgress)
  const midScale = direction === "next"
    ? lerp(0.95, 1, nextProgress)
    : lerp(0.95, 0.98, prevProgress)
  const backScale = direction === "next"
    ? lerp(0.9, 0.95, nextProgress)
    : lerp(0.9, 0.94, prevProgress)
  const bottomScale = direction === "next"
    ? lerp(0.86, 0.9, nextProgress)
    : lerp(0.86, 0.9, prevProgress)
  const midOpacity = direction === "next"
    ? lerp(0.9, 1, nextProgress)
    : lerp(0.9, 0.98, prevProgress)
  const backOpacity = direction === "next"
    ? lerp(0.8, 0.9, nextProgress)
    : lerp(0.8, 0.9, prevProgress)
  const bottomOpacity = direction === "next"
    ? lerp(0.66, 0.78, nextProgress)
    : lerp(0.66, 0.78, prevProgress)
  const midY = direction === "next"
    ? lerp(-48, -50, nextProgress)
    : lerp(-48, -48, prevProgress)
  const backY = direction === "next"
    ? lerp(-46, -48, nextProgress)
    : lerp(-46, -46, prevProgress)
  const bottomY = direction === "next"
    ? lerp(-44, -46, nextProgress)
    : lerp(-44, -44, prevProgress)
  return {
    front: `transform: translate3d(${x}px, calc(-50% + ${verticalOffset}px), 0) rotate(${rotate}deg) scale(${lerp(1, 0.985, progress)}); ${transition}`,
    mid: `transform: translate3d(${midX}rpx, ${midY}%, 0) scale(${midScale}); opacity: ${midOpacity}; ${transition}`,
    back: `transform: translate3d(${backX}rpx, ${backY}%, 0) scale(${backScale}); opacity: ${backOpacity}; ${transition}`,
    bottom: `transform: translate3d(${bottomX}rpx, ${bottomY}%, 0) scale(${bottomScale}); opacity: ${bottomOpacity}; ${transition}`
  }
}

function buildViewerBaseStyles(width) {
  return buildViewerDragStyles({
    dx: 0,
    dy: 0,
    width,
    direction: "",
    animated: false
  })
}

function buildViewerPrefetchImages(images, activeIndex) {
  const list = normalizeImages(images)
  const total = list.length
  if (total <= VIEWER_PREFETCH_OFFSETS.length) return list
  const out = []
  const seen = Object.create(null)
  for (const offset of VIEWER_PREFETCH_OFFSETS) {
    const item = list[normalizeGalleryIndex(activeIndex + offset, total)]
    if (!item || !item.src || seen[item.src]) continue
    seen[item.src] = true
    out.push(item)
  }
  return out
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    images: {
      type: Array,
      value: []
    },
    initialIndex: {
      type: Number,
      value: 0
    }
  },
  data: {
    rendered: false,
    active: false,
    viewerImages: [],
    viewerFrontImage: null,
    viewerFrontBoxStyle: "",
    viewerStackMidImage: null,
    viewerStackBackImage: null,
    viewerStackBottomImage: null,
    viewerIndex: 0,
    viewerFrontStyle: "",
    viewerStackMidStyle: "",
    viewerStackBackStyle: "",
    viewerStackBottomStyle: "",
    viewerCountText: ""
  },
  observers: {
    visible(v) {
      if (v) {
        this.openViewer()
      } else {
        this.hideViewer()
      }
    },
    "images, initialIndex"() {
      if (this.properties.visible) {
        this.openViewer()
      }
    }
  },
  lifetimes: {
    attached() {
      this.calcViewerBounds()
      if (this.properties.visible) {
        this.openViewer()
      }
    },
    detached() {
      clearTimeout(this._hideTimer)
      clearTimeout(this._swipeTimer)
      clearTimeout(this._viewerDragFrameTimer)
    }
  },
  methods: {
    cacheViewerImageMeta(src, width, height) {
      if (!src || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return false
      if (!this._viewerImageMeta) this._viewerImageMeta = Object.create(null)
      const prev = this._viewerImageMeta[src]
      if (prev && prev.width === width && prev.height === height) return false
      const next = { width, height }
      this._viewerImageMeta[src] = next
      IMAGE_META_CACHE[src] = next
      return true
    },
    hydrateViewerImageMeta(images) {
      if (!this._viewerImageMeta) this._viewerImageMeta = Object.create(null)
      const list = normalizeImages(images)
      for (const it of list) {
        const src = it && it.src
        if (!src || this._viewerImageMeta[src] || !IMAGE_META_CACHE[src]) continue
        this._viewerImageMeta[src] = IMAGE_META_CACHE[src]
      }
    },
    calcViewerBounds() {
      try {
        const sys = wx.getSystemInfoSync()
        const w = Number(sys && sys.windowWidth) || 375
        const h = Number(sys && sys.windowHeight) || 760
        this._viewerWidthPx = w * ((750 - 88) / 750)
        this._viewerHeightPx = Math.max(240, h * 0.62)
      } catch (e) {
        this._viewerWidthPx = 331
        this._viewerHeightPx = 470
      }
    },
    syncViewerStyles(styles) {
      this._lastViewerStyles = styles
    },
    applyViewerStyles(styles) {
      if (!styles) return
      const payload = {}
      const prev = this._lastViewerStyles || {}
      if (styles.front !== prev.front) payload.viewerFrontStyle = styles.front
      if (styles.mid !== prev.mid) payload.viewerStackMidStyle = styles.mid
      if (styles.back !== prev.back) payload.viewerStackBackStyle = styles.back
      if (styles.bottom !== prev.bottom) payload.viewerStackBottomStyle = styles.bottom
      this.syncViewerStyles(styles)
      if (!Object.keys(payload).length) return
      this.setData(payload)
    },
    clearViewerDragFrame() {
      clearTimeout(this._viewerDragFrameTimer)
      this._viewerDragFrameTimer = null
      this._pendingViewerDrag = null
    },
    flushViewerDragFrame() {
      if (!this._pendingViewerDrag) return
      const drag = this._pendingViewerDrag
      this.clearViewerDragFrame()
      const styles = buildViewerDragStyles({
        dx: drag.dx,
        dy: drag.dy,
        width: this._viewerWidthPx,
        direction: drag.direction,
        animated: false
      })
      this.applyViewerStyles(styles)
    },
    scheduleViewerDragUpdate(nextDrag) {
      this._pendingViewerDrag = nextDrag
      if (this._viewerDragFrameTimer) return
      this._viewerDragFrameTimer = setTimeout(() => {
        this._viewerDragFrameTimer = null
        const drag = this._pendingViewerDrag
        this._pendingViewerDrag = null
        if (!drag) return
        const styles = buildViewerDragStyles({
          dx: drag.dx,
          dy: drag.dy,
          width: this._viewerWidthPx,
          direction: drag.direction,
          animated: false
        })
        this.applyViewerStyles(styles)
      }, VIEWER_MOVE_FRAME_MS)
    },
    isViewerVisibleImage(src) {
      if (!src) return false
      const frontImage = this.data.viewerFrontImage
      if (frontImage && frontImage.src === src) return true
      return [
        this.data.viewerStackMidImage,
        this.data.viewerStackBackImage,
        this.data.viewerStackBottomImage
      ].some((it) => it && it.src === src)
    },
    getViewerSwipeVelocity() {
      const touch = this._viewerTouch
      const samples = touch && Array.isArray(touch.samples) ? touch.samples : []
      if (!samples.length) return 0
      const last = samples[samples.length - 1]
      const prev = samples[samples.length - 2] || samples[0]
      const dt = Math.max(1, Number(last.time || 0) - Number(prev.time || 0))
      return (Number(last.x || 0) - Number(prev.x || 0)) / dt
    },
    refreshViewerDeck() {
      if (!this.data.rendered) return
      const deck = buildViewerDeck(
        this.data.viewerImages,
        this.data.viewerIndex,
        this._viewerImageMeta,
        this._viewerWidthPx,
        this._viewerHeightPx
      )
      this.setData({
        viewerFrontImage: deck.frontImage,
        viewerFrontBoxStyle: deck.frontBoxStyle,
        viewerStackMidImage: deck.stackSlots.mid,
        viewerStackBackImage: deck.stackSlots.back,
        viewerStackBottomImage: deck.stackSlots.bottom,
        viewerIndex: deck.index,
        viewerCountText: deck.countText
      })
    },
    openViewer() {
      clearTimeout(this._hideTimer)
      const images = normalizeImages(this.properties.images)
      if (!images.length) return
      this.hydrateViewerImageMeta(images)
      const deck = buildViewerDeck(
        images,
        this.properties.initialIndex,
        this._viewerImageMeta,
        this._viewerWidthPx,
        this._viewerHeightPx
      )
      const baseStyles = buildViewerBaseStyles(this._viewerWidthPx)
      this.syncViewerStyles(baseStyles)
      const nextData = {
        rendered: true,
        viewerImages: images,
        viewerFrontImage: deck.frontImage,
        viewerFrontBoxStyle: deck.frontBoxStyle,
        viewerStackMidImage: deck.stackSlots.mid,
        viewerStackBackImage: deck.stackSlots.back,
        viewerStackBottomImage: deck.stackSlots.bottom,
        viewerIndex: deck.index,
        viewerFrontStyle: baseStyles.front,
        viewerStackMidStyle: baseStyles.mid,
        viewerStackBackStyle: baseStyles.back,
        viewerStackBottomStyle: baseStyles.bottom,
        viewerCountText: deck.countText
      }
      if (!this.data.rendered) {
        nextData.active = false
      }
      this.setData(nextData, () => {
        this.ensureViewerImageMeta(images, deck.index)
        if (!this.data.active) {
          wx.nextTick(() => {
            this.setData({ active: true })
          })
        }
      })
    },
    hideViewer() {
      clearTimeout(this._hideTimer)
      clearTimeout(this._swipeTimer)
      this.clearViewerDragFrame()
      if (!this.data.rendered) return
      this.setData({ active: false })
      this._hideTimer = setTimeout(() => {
        const baseStyles = buildViewerBaseStyles(this._viewerWidthPx)
        this.syncViewerStyles(baseStyles)
        this.setData({
          rendered: false,
          viewerImages: [],
          viewerFrontImage: null,
          viewerFrontBoxStyle: "",
          viewerStackMidImage: null,
          viewerStackBackImage: null,
          viewerStackBottomImage: null,
          viewerIndex: 0,
          viewerFrontStyle: baseStyles.front,
          viewerStackMidStyle: baseStyles.mid,
          viewerStackBackStyle: baseStyles.back,
          viewerStackBottomStyle: baseStyles.bottom,
          viewerCountText: ""
        })
      }, 180)
    },
    stopTap() {},
    requestClose() {
      this.triggerEvent("close")
    },
    onViewerTouchStart(e) {
      if ((this.data.viewerImages || []).length <= 1) return
      const touch = e && e.touches && e.touches[0]
      if (!touch) return
      clearTimeout(this._swipeTimer)
      this.clearViewerDragFrame()
      const now = Date.now()
      this._viewerTouch = {
        startX: Number(touch.clientX || 0),
        startY: Number(touch.clientY || 0),
        dx: 0,
        dy: 0,
        dragging: true,
        axis: "",
        queuedDx: 0,
        queuedDy: 0,
        samples: [{
          x: Number(touch.clientX || 0),
          time: now
        }]
      }
    },
    onViewerTouchMove(e) {
      const touch = e && e.touches && e.touches[0]
      if (!touch || !this._viewerTouch || !this._viewerTouch.dragging) return
      const rawDx = Number(touch.clientX || 0) - this._viewerTouch.startX
      const dy = Number(touch.clientY || 0) - this._viewerTouch.startY
      const rightLimit = Math.max(24, this._viewerWidthPx * VIEWER_RIGHT_DRAG_MAX_RATIO)
      const dx = rawDx > 0
        ? Math.min(rawDx * VIEWER_RIGHT_DRAG_DAMPING, rightLimit)
        : rawDx
      this._viewerTouch.dx = dx
      this._viewerTouch.dy = dy
      if (!this._viewerTouch.axis) {
        const absX = Math.abs(rawDx)
        const absY = Math.abs(dy)
        if (absX < VIEWER_AXIS_LOCK_DISTANCE && absY < VIEWER_AXIS_LOCK_DISTANCE) return
        if (absY > absX * 1.2) {
          this._viewerTouch.axis = "y"
          return
        }
        this._viewerTouch.axis = "x"
      }
      if (this._viewerTouch.axis !== "x") return
      const now = Date.now()
      const samples = this._viewerTouch.samples || []
      samples.push({
        x: Number(touch.clientX || 0),
        time: now
      })
      if (samples.length > 4) samples.shift()
      this._viewerTouch.samples = samples
      if (
        Math.abs(dx - Number(this._viewerTouch.queuedDx || 0)) < VIEWER_MOVE_EPSILON &&
        Math.abs(dy - Number(this._viewerTouch.queuedDy || 0)) < VIEWER_MOVE_EPSILON
      ) {
        return
      }
      this._viewerTouch.queuedDx = dx
      this._viewerTouch.queuedDy = dy
      const direction = dx < 0 ? "next" : ""
      this.scheduleViewerDragUpdate({ dx, dy, direction })
    },
    onViewerTouchEnd() {
      if (!this._viewerTouch || !this._viewerTouch.dragging) return
      this.flushViewerDragFrame()
      const width = Math.max(1, Number(this._viewerWidthPx) || 320)
      const threshold = Math.max(72, width * 0.22)
      const dx = Number(this._viewerTouch.dx || 0)
      const dy = Number(this._viewerTouch.dy || 0)
      const velocityX = this.getViewerSwipeVelocity()
      const shouldSwipe = dx < 0 && (
        Math.abs(dx) >= threshold || (Math.abs(dx) >= 24 && Math.abs(velocityX) >= 0.6)
      )
      const direction = "next"
      this._viewerTouch.dragging = false
      if (this._viewerTouch.axis && this._viewerTouch.axis !== "x") {
        this._viewerTouch = null
        return
      }
      if (!shouldSwipe) {
        const resetStyles = buildViewerDragStyles({
          dx: 0,
          dy: 0,
          width,
          direction: "",
          animated: true
        })
        this.syncViewerStyles(resetStyles)
        this.setData({
          viewerFrontStyle: resetStyles.front,
          viewerStackMidStyle: resetStyles.mid,
          viewerStackBackStyle: resetStyles.back,
          viewerStackBottomStyle: resetStyles.bottom
        })
        this._swipeTimer = setTimeout(() => {
          const baseStyles = buildViewerBaseStyles(width)
          this.syncViewerStyles(baseStyles)
          this.setData({
            viewerFrontStyle: baseStyles.front,
            viewerStackMidStyle: baseStyles.mid,
            viewerStackBackStyle: baseStyles.back,
            viewerStackBottomStyle: baseStyles.bottom
          })
        }, 220)
        this._viewerTouch = null
        return
      }
      const exitX = (direction === "next" ? -1 : 1) * (width * 1.18)
      const styles = buildViewerDragStyles({
        dx: exitX,
        dy,
        width,
        direction,
        animated: true
      })
      this.syncViewerStyles(styles)
      this.setData({
        viewerFrontStyle: styles.front,
        viewerStackMidStyle: styles.mid,
        viewerStackBackStyle: styles.back,
        viewerStackBottomStyle: styles.bottom
      })
      this._swipeTimer = setTimeout(() => {
        const nextIndex = normalizeGalleryIndex(
          this.data.viewerIndex + (direction === "next" ? 1 : -1),
          (this.data.viewerImages || []).length
        )
        const deck = buildViewerDeck(
          this.data.viewerImages,
          nextIndex,
          this._viewerImageMeta,
          this._viewerWidthPx,
          this._viewerHeightPx
        )
        const baseStyles = buildViewerBaseStyles(width)
        this.syncViewerStyles(baseStyles)
        this.setData({
          viewerFrontImage: deck.frontImage,
          viewerFrontBoxStyle: deck.frontBoxStyle,
          viewerStackMidImage: deck.stackSlots.mid,
          viewerStackBackImage: deck.stackSlots.back,
          viewerStackBottomImage: deck.stackSlots.bottom,
          viewerIndex: deck.index,
          viewerFrontStyle: baseStyles.front,
          viewerStackMidStyle: baseStyles.mid,
          viewerStackBackStyle: baseStyles.back,
          viewerStackBottomStyle: baseStyles.bottom,
          viewerCountText: deck.countText
        })
        this.ensureViewerImageMeta(this.data.viewerImages, deck.index)
        this._viewerTouch = null
      }, 220)
    },
    onViewerTouchCancel() {
      this.onViewerTouchEnd()
    },
    onViewerImageLoad(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
      const src = String(ds.src || "").trim()
      const detail = (e && e.detail) || {}
      const width = Number(detail.width)
      const height = Number(detail.height)
      if (!src || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return
      const changed = this.cacheViewerImageMeta(src, width, height)
      if (changed && this.isViewerVisibleImage(src)) this.refreshViewerDeck()
    },
    ensureViewerImageMeta(images, activeIndex) {
      this.hydrateViewerImageMeta(images)
      const list = buildViewerPrefetchImages(images, activeIndex)
      for (const it of list) {
        const src = it.src
        if (!src || this._viewerImageMeta[src]) continue
        wx.getImageInfo({
          src,
          success: (res) => {
            const width = Number(res && res.width)
            const height = Number(res && res.height)
            const changed = this.cacheViewerImageMeta(src, width, height)
            if (changed && this.isViewerVisibleImage(src)) this.refreshViewerDeck()
          },
          fail: () => {}
        })
      }
    }
  }
})
