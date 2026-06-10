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

function buildViewerStackImages(images, activeIndex) {
  const list = Array.isArray(images) ? images.filter((x) => x && x.src) : []
  const total = list.length
  if (total <= 1) return []
  const out = []
  const layers = Math.min(total - 1, 2)
  for (let offset = 1; offset <= layers; offset += 1) {
    const imageIndex = normalizeGalleryIndex(activeIndex + offset, total)
    const it = list[imageIndex]
    out.push({
      src: it.src,
      alt: it.alt || "",
      layerClass: offset === 1 ? "detail-viewer-stack-mid" : "detail-viewer-stack-back"
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
    viewerIndex: 0,
    viewerStackImages: [],
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
  },
  formatViewerCountText(index, total) {
    const i = Math.max(0, Number(index) || 0) + 1
    const t = Math.max(0, Number(total) || 0)
    return `${i} / ${t}`
  },
  noop() {},
  onTapGallery(e) {
    const blockIndex = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.blockIndex) || -1)
    const blocks = Array.isArray(this.data.contentBlocks) ? this.data.contentBlocks : []
    const block = blockIndex >= 0 ? blocks[blockIndex] : null
    const images = Array.isArray(this.data.articleImages) ? this.data.articleImages : []
    if (!images.length) return
    const viewerIndex = normalizeGalleryIndex(block && block.activeIndex, images.length)
    clearTimeout(this._viewerHideTimer)
    this.setData({
      viewerShow: true,
      viewerActive: false,
      viewerImages: images,
      viewerIndex,
      viewerStackImages: buildViewerStackImages(images, viewerIndex),
      viewerCountText: this.formatViewerCountText(viewerIndex, images.length)
    }, () => {
      wx.nextTick(() => {
        this.setData({ viewerActive: true })
      })
    })
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
  onViewerChange(e) {
    const index = e && e.detail ? Number(e.detail.current || 0) : 0
    const total = Array.isArray(this.data.viewerImages) ? this.data.viewerImages.length : 0
    this.setData({
      viewerIndex: index,
      viewerStackImages: buildViewerStackImages(this.data.viewerImages, index),
      viewerCountText: this.formatViewerCountText(index, total)
    })
  },
  onCloseViewer() {
    clearTimeout(this._viewerHideTimer)
    this.setData({ viewerActive: false })
    this._viewerHideTimer = setTimeout(() => {
      this.setData({
        viewerShow: false,
        viewerImages: [],
        viewerIndex: 0,
        viewerStackImages: [],
        viewerCountText: ""
      })
    }, 180)
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
    const tt = String(this.data.title || "").trim()
    wx.setNavigationBarTitle({ title: tt || dict.newsDetail.title })
  }
})
