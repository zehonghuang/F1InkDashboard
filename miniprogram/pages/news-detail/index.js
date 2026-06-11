const { fetchNewsDetail } = require("../../services/mpNewsApi")
const i18n = require("../../services/i18n")

function isImageNode(node) {
  return Boolean(
    node &&
      typeof node === "object" &&
      String(node.name || "").trim().toLowerCase() === "img" &&
      node.attrs &&
      typeof node.attrs === "object" &&
      String(node.attrs.src || "").trim()
  )
}

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

function buildViewerDeck(images, activeIndex, imageMeta, maxWidth, maxHeight) {
  const list = Array.isArray(images) ? images.filter((x) => x && x.src) : []
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
  const transition = animated ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out;" : "transition: none;"
  const nextMidX = direction === "next" ? 22 : 50
  const nextBackX = direction === "next" ? 54 : 88
  return {
    front: `transform: translate3d(${x}px, calc(-50% - ${lift}px), 0) rotate(${rotate}deg) scale(${lerp(1, 0.985, progress)}); ${transition}`,
    mid: `transform: translate3d(${lerp(42, nextMidX, progress)}rpx, -48%, 0) scale(${lerp(0.95, 0.98, progress)}); opacity: ${lerp(0.9, 0.98, progress)}; ${transition}`,
    back: `transform: translate3d(${lerp(82, nextBackX, progress)}rpx, -46%, 0) scale(${lerp(0.9, 0.94, progress)}); opacity: ${lerp(0.8, 0.9, progress)}; ${transition}`
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

function buildGalleryPreviewImages(images, activeIndex) {
  const list = Array.isArray(images) ? images.filter((x) => x && x.src) : []
  const total = list.length
  if (!total) return []
  const cur = normalizeGalleryIndex(activeIndex, total)
  const layers = Math.min(total, 3)
  const out = []
  for (let offset = 0; offset < layers; offset += 1) {
    const imageIndex = normalizeGalleryIndex(cur + offset, total)
    const it = list[imageIndex]
    out.push({
      src: it.src,
      alt: it.alt || "",
      imageIndex,
      layerClass: offset === 0 ? "detail-gallery-card-front" : offset === 1 ? "detail-gallery-card-mid" : "detail-gallery-card-back"
    })
  }
  return out
}

function buildViewerStackImages(images, activeIndex, imageMeta, maxWidth, maxHeight) {
  const list = Array.isArray(images) ? images.filter((x) => x && x.src) : []
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
  return out
}

function buildGalleryBlock(images, idx) {
  const list = Array.isArray(images) ? images.filter((x) => x && x.src) : []
  return {
    id: `gallery_${idx}`,
    type: "gallery",
    images: list,
    localCount: list.length
  }
}

function collectArticleImages(nodes) {
  const arr = Array.isArray(nodes) ? nodes : []
  const out = []
  for (const node of arr) {
    if (!isImageNode(node)) continue
    out.push({
      src: String(node.attrs.src || "").trim(),
      alt: String((node.attrs.alt || node.attrs.title || "") || "").trim()
    })
  }
  return out
}

function decorateGalleryBlocks(blocks, articleImages) {
  const images = Array.isArray(articleImages) ? articleImages.filter((x) => x && x.src) : []
  const out = Array.isArray(blocks) ? blocks.slice() : []
  let cursor = 0
  for (let i = 0; i < out.length; i += 1) {
    const block = out[i]
    if (!block || block.type !== "gallery") continue
    const localCount = Math.max(0, Number(block.localCount || (block.images && block.images.length) || 0))
    const activeIndex = normalizeGalleryIndex(cursor, images.length)
    out[i] = {
      ...block,
      articleStartIndex: activeIndex,
      activeIndex,
      inlineImage: images[activeIndex] || null,
      previewImages: buildGalleryPreviewImages(images, activeIndex),
      count: images.length,
      stacked: images.length > 1,
      currentText: images.length ? `${activeIndex + 1} / ${images.length}` : ""
    }
    cursor += localCount
  }
  return out
}

function buildContentBlocks(nodes) {
  const arr = Array.isArray(nodes) ? nodes : []
  const blocks = []
  let richNodes = []
  let galleryImages = []

  const flushRich = () => {
    if (!richNodes.length) return
    blocks.push({ id: `rich_${blocks.length}`, type: "rich", nodes: richNodes })
    richNodes = []
  }

  const flushGallery = () => {
    if (!galleryImages.length) return
    blocks.push(buildGalleryBlock(galleryImages, blocks.length))
    galleryImages = []
  }

  for (const node of arr) {
    if (isImageNode(node)) {
      flushRich()
      galleryImages.push({
        src: String(node.attrs.src || "").trim(),
        alt: String((node.attrs.alt || node.attrs.title || "") || "").trim()
      })
      continue
    }
    flushGallery()
    richNodes.push(node)
  }

  flushRich()
  flushGallery()
  return blocks
}

Page({
  data: {
    i18n: i18n.getDict(),
    id: "",
    title: "",
    tagText: "",
    timeText: "",
    contentFormatCode: "PLAIN",
    contentText: "",
    contentNodes: [],
    contentBlocks: [],
    articleImages: [],
    viewerShow: false,
    viewerActive: false,
    viewerImages: [],
    viewerFrontImage: null,
    viewerFrontBoxStyle: "",
    viewerStackImages: [],
    viewerIndex: 0,
    viewerFrontStyle: "",
    viewerStackMidStyle: "",
    viewerStackBackStyle: "",
    viewerCountText: "",
    loading: false,
    errorText: ""
  },
  onShareAppMessage() {
    const id = String(this.data.id || "").trim()
    const title = String(this.data.title || "").trim() || i18n.t("newsDetail.title")
    const path = id ? `/pages/news-detail/index?id=${encodeURIComponent(id)}` : "/pages/news/index"
    return { title, path }
  },
  onLoad(query) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    const id = (query && query.id) || ""
    if (!id) {
      this.setData({ errorText: i18n.t("newsDetail.missingId") })
      return
    }
    this.setData({ loading: true, errorText: "" })
    fetchNewsDetail({ id, tz: "Asia/Shanghai" })
      .then((matched) => {
        const content = (matched && matched.content) || { formatCode: "PLAIN", text: "", nodes: [] }
        const contentNodes = content.formatCode === "RICH_TEXT_NODES" ? content.nodes || [] : []
        const articleImages = collectArticleImages(contentNodes)
        const contentBlocks = decorateGalleryBlocks(buildContentBlocks(contentNodes), articleImages)
        this.setData({
          id: matched ? matched.id : "",
          title: matched ? matched.title : "",
          tagText: matched ? matched.tagText : "",
          timeText: matched ? matched.timeText : "",
          contentFormatCode: content.formatCode || "PLAIN",
          contentText: content.formatCode === "PLAIN" ? content.text || "" : "",
          contentNodes,
          contentBlocks,
          articleImages,
          loading: false
        }, () => {
          const tt = String(this.data.title || "").trim()
          wx.setNavigationBarTitle({ title: tt || i18n.t("newsDetail.title") })
        })
      })
      .catch(() => {
        this.setData({ loading: false, errorText: i18n.t("newsDetail.loadFailed") })
      })
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
    clearTimeout(this._viewerHideTimer)
    clearTimeout(this._viewerSwipeTimer)
  },
  formatViewerCountText(index, total) {
    const i = Math.max(0, Number(index) || 0) + 1
    const t = Math.max(0, Number(total) || 0)
    return `${i} / ${t}`
  },
  noop() {},
  refreshViewerDeck() {
    if (!this.data.viewerShow) return
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
  onTapGallery(e) {
    const blockIndex = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.blockIndex) || -1)
    const blocks = Array.isArray(this.data.contentBlocks) ? this.data.contentBlocks : []
    const block = blockIndex >= 0 ? blocks[blockIndex] : null
    const images = Array.isArray(this.data.articleImages) ? this.data.articleImages : []
    if (!images.length) return
    const viewerIndex = normalizeGalleryIndex(block && block.activeIndex, images.length)
    clearTimeout(this._viewerHideTimer)
    const deck = buildViewerDeck(images, viewerIndex, this._viewerImageMeta, this._viewerWidthPx, this._viewerHeightPx)
    const baseStyles = buildViewerBaseStyles(this._viewerWidthPx)
    this.setData({
      viewerShow: true,
      viewerActive: false,
      viewerImages: images,
      viewerFrontImage: deck.frontImage,
      viewerFrontBoxStyle: deck.frontBoxStyle,
      viewerStackImages: deck.stackImages,
      viewerIndex: deck.index,
      viewerFrontStyle: baseStyles.front,
      viewerStackMidStyle: baseStyles.mid,
      viewerStackBackStyle: baseStyles.back,
      viewerCountText: deck.countText
    }, () => {
      wx.nextTick(() => {
        this.setData({ viewerActive: true })
      })
    })
    this.ensureViewerImageMeta(images)
  },
  onGalleryStep(e) {
    const blockIndex = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.blockIndex) || -1)
    const delta = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.delta) || 0)
    const blocks = Array.isArray(this.data.contentBlocks) ? this.data.contentBlocks.slice() : []
    const block = blockIndex >= 0 ? blocks[blockIndex] : null
    const images = Array.isArray(this.data.articleImages) ? this.data.articleImages : []
    if (!block || images.length <= 1 || !delta) return
    const activeIndex = normalizeGalleryIndex((block.activeIndex || 0) + delta, images.length)
    blocks[blockIndex] = {
      ...block,
      activeIndex,
      previewImages: buildGalleryPreviewImages(images, activeIndex),
      currentText: `${activeIndex + 1} / ${images.length}`
    }
    this.setData({ contentBlocks: blocks })
  },
  onViewerTouchStart(e) {
    if ((this.data.viewerImages || []).length <= 1) return
    const touch = e && e.touches && e.touches[0]
    if (!touch) return
    clearTimeout(this._viewerSwipeTimer)
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
      viewerStackBackStyle: styles.back
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
      this._viewerSwipeTimer = setTimeout(() => {
        const baseStyles = buildViewerBaseStyles(width)
        this.setData({
          viewerFrontStyle: baseStyles.front,
          viewerStackMidStyle: baseStyles.mid,
          viewerStackBackStyle: baseStyles.back
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
      viewerStackBackStyle: styles.back
    })
    this._viewerSwipeTimer = setTimeout(() => {
      const nextIndex = normalizeGalleryIndex(
        this.data.viewerIndex + (direction === "next" ? 1 : -1),
        (this.data.viewerImages || []).length
      )
      const deck = buildViewerDeck(this.data.viewerImages, nextIndex, this._viewerImageMeta, this._viewerWidthPx, this._viewerHeightPx)
      const baseStyles = buildViewerBaseStyles(width)
      this.setData({
        viewerFrontImage: deck.frontImage,
        viewerFrontBoxStyle: deck.frontBoxStyle,
        viewerStackImages: deck.stackImages,
        viewerIndex: deck.index,
        viewerFrontStyle: baseStyles.front,
        viewerStackMidStyle: baseStyles.mid,
        viewerStackBackStyle: baseStyles.back,
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
    const list = Array.isArray(images) ? images : []
    for (const it of list) {
      const src = String(it && it.src || "").trim()
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
  },
  onCloseViewer() {
    clearTimeout(this._viewerHideTimer)
    clearTimeout(this._viewerSwipeTimer)
    this.setData({ viewerActive: false })
    this._viewerHideTimer = setTimeout(() => {
      const baseStyles = buildViewerBaseStyles(this._viewerWidthPx)
      this.setData({
        viewerShow: false,
        viewerImages: [],
        viewerFrontImage: null,
        viewerFrontBoxStyle: "",
        viewerStackImages: [],
        viewerIndex: 0,
        viewerFrontStyle: baseStyles.front,
        viewerStackMidStyle: baseStyles.mid,
        viewerStackBackStyle: baseStyles.back,
        viewerCountText: ""
      })
    }, 180)
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
    const tt = String(this.data.title || "").trim()
    wx.setNavigationBarTitle({ title: tt || dict.newsDetail.title })
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
  }
})
