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

function buildViewerStackImages(images, activeIndex, imageMeta, maxWidth, maxHeight) {
  const list = normalizeImages(images)
  const total = list.length
  if (total <= 1) return []
  const out = []
  if (total > 1) {
    const mid = list[normalizeGalleryIndex(activeIndex + 1, total)]
    out.push({
      src: mid.src,
      alt: mid.alt || "",
      layerClass: "detail-viewer-stack-mid",
      boxStyle: buildViewerBoxStyle(imageMeta && imageMeta[mid.src], maxWidth, maxHeight)
    })
  }
  if (total > 2) {
    const back = list[normalizeGalleryIndex(activeIndex + 2, total)]
    out.push({
      src: back.src,
      alt: back.alt || "",
      layerClass: "detail-viewer-stack-back",
      boxStyle: buildViewerBoxStyle(imageMeta && imageMeta[back.src], maxWidth, maxHeight)
    })
  }
  if (total > 2) {
    const bottom = list[normalizeGalleryIndex(activeIndex + 3, total)]
    out.push({
      src: bottom.src,
      alt: bottom.alt || "",
      layerClass: "detail-viewer-stack-bottom",
      boxStyle: buildViewerBoxStyle(imageMeta && imageMeta[bottom.src], maxWidth, maxHeight)
    })
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
    stackImages: buildViewerStackImages(list, index, imageMeta, maxWidth, maxHeight),
    index,
    countText: `${index + 1} / ${total}`
  }
}

function buildViewerDragStyles({ dx, dy, width, direction, animated }) {
  const w = Math.max(1, Number(width) || 320)
  const x = Number(dx) || 0
  const y = Number(dy) || 0
  const progress = clamp(Math.abs(x) / Math.max(90, w * 0.32), 0, 1)
  const rotate = clamp(x / 18, -12, 12)
  const lift = clamp(Math.abs(y) * 0.08 + Math.abs(x) * 0.02, 0, 20)
  const transition = animated
    ? "transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out;"
    : "transition: none;"
  const nextMidX = direction === "next" ? 22 : 50
  const nextBackX = direction === "next" ? 54 : 88
  const nextBottomX = direction === "next" ? 88 : 118
  return {
    front: `transform: translate3d(${x}px, calc(-50% - ${lift}px), 0) rotate(${rotate}deg) scale(${lerp(1, 0.985, progress)}); ${transition}`,
    mid: `transform: translate3d(${lerp(42, nextMidX, progress)}rpx, -48%, 0) scale(${lerp(0.95, 0.98, progress)}); opacity: ${lerp(0.9, 0.98, progress)}; ${transition}`,
    back: `transform: translate3d(${lerp(82, nextBackX, progress)}rpx, -46%, 0) scale(${lerp(0.9, 0.94, progress)}); opacity: ${lerp(0.8, 0.9, progress)}; ${transition}`,
    bottom: `transform: translate3d(${lerp(112, nextBottomX, progress)}rpx, -44%, 0) scale(${lerp(0.86, 0.9, progress)}); opacity: ${lerp(0.66, 0.78, progress)}; ${transition}`
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
    viewerStackImages: [],
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
    }
  },
  methods: {
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
        viewerStackImages: deck.stackImages,
        viewerIndex: deck.index,
        viewerCountText: deck.countText
      })
    },
    openViewer() {
      clearTimeout(this._hideTimer)
      const images = normalizeImages(this.properties.images)
      if (!images.length) return
      const deck = buildViewerDeck(
        images,
        this.properties.initialIndex,
        this._viewerImageMeta,
        this._viewerWidthPx,
        this._viewerHeightPx
      )
      const baseStyles = buildViewerBaseStyles(this._viewerWidthPx)
      const nextData = {
        rendered: true,
        viewerImages: images,
        viewerFrontImage: deck.frontImage,
        viewerFrontBoxStyle: deck.frontBoxStyle,
        viewerStackImages: deck.stackImages,
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
        this.ensureViewerImageMeta(images)
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
      if (!this.data.rendered) return
      this.setData({ active: false })
      this._hideTimer = setTimeout(() => {
        const baseStyles = buildViewerBaseStyles(this._viewerWidthPx)
        this.setData({
          rendered: false,
          viewerImages: [],
          viewerFrontImage: null,
          viewerFrontBoxStyle: "",
          viewerStackImages: [],
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
      this._viewerTouch = {
        startX: Number(touch.clientX || 0),
        startY: Number(touch.clientY || 0),
        dx: 0,
        dy: 0,
        dragging: true
      }
    },
    onViewerTouchMove(e) {
      const touch = e && e.touches && e.touches[0]
      if (!touch || !this._viewerTouch || !this._viewerTouch.dragging) return
      const dx = Number(touch.clientX || 0) - this._viewerTouch.startX
      const dy = Number(touch.clientY || 0) - this._viewerTouch.startY
      this._viewerTouch.dx = dx
      this._viewerTouch.dy = dy
      const direction = dx < 0 ? "next" : "prev"
      const styles = buildViewerDragStyles({
        dx,
        dy,
        width: this._viewerWidthPx,
        direction,
        animated: false
      })
      this.setData({
        viewerFrontStyle: styles.front,
        viewerStackMidStyle: styles.mid,
        viewerStackBackStyle: styles.back,
        viewerStackBottomStyle: styles.bottom
      })
    },
    onViewerTouchEnd() {
      if (!this._viewerTouch || !this._viewerTouch.dragging) return
      const width = Math.max(1, Number(this._viewerWidthPx) || 320)
      const threshold = Math.max(72, width * 0.22)
      const dx = Number(this._viewerTouch.dx || 0)
      const dy = Number(this._viewerTouch.dy || 0)
      const shouldSwipe = Math.abs(dx) >= threshold
      const direction = dx < 0 ? "next" : "prev"
      this._viewerTouch.dragging = false
      if (!shouldSwipe) {
        const resetStyles = buildViewerDragStyles({
          dx: 0,
          dy: 0,
          width,
          direction: "",
          animated: true
        })
        this.setData({
          viewerFrontStyle: resetStyles.front,
          viewerStackMidStyle: resetStyles.mid,
          viewerStackBackStyle: resetStyles.back
        })
        this._swipeTimer = setTimeout(() => {
          const baseStyles = buildViewerBaseStyles(width)
          this.setData({
            viewerFrontStyle: baseStyles.front,
            viewerStackMidStyle: baseStyles.mid,
            viewerStackBackStyle: baseStyles.back,
            viewerStackBottomStyle: baseStyles.bottom
          })
        }, 220)
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
        this.setData({
          viewerFrontImage: deck.frontImage,
          viewerFrontBoxStyle: deck.frontBoxStyle,
          viewerStackImages: deck.stackImages,
          viewerIndex: deck.index,
          viewerFrontStyle: baseStyles.front,
          viewerStackMidStyle: baseStyles.mid,
          viewerStackBackStyle: baseStyles.back,
          viewerStackBottomStyle: baseStyles.bottom,
          viewerCountText: deck.countText
        })
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
      if (!this._viewerImageMeta) this._viewerImageMeta = {}
      const prev = this._viewerImageMeta[src]
      if (prev && prev.width === width && prev.height === height) return
      this._viewerImageMeta[src] = { width, height }
      this.refreshViewerDeck()
    },
    ensureViewerImageMeta(images) {
      if (!this._viewerImageMeta) this._viewerImageMeta = {}
      const list = normalizeImages(images)
      for (const it of list) {
        const src = it.src
        if (!src || this._viewerImageMeta[src]) continue
        wx.getImageInfo({
          src,
          success: (res) => {
            const width = Number(res && res.width)
            const height = Number(res && res.height)
            if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return
            this._viewerImageMeta[src] = { width, height }
            this.refreshViewerDeck()
          },
          fail: () => {}
        })
      }
    }
  }
})
