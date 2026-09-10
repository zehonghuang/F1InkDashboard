const i18n = require("../../../../services/i18n")
const { getPosterCache, fetchPoster } = require("../../../../services/mpPosterApi")

const F1_SHOP_CARD_TAG = "f1-shop-card"

function isShopCardNode(node) {
  return Boolean(
    node &&
      typeof node === "object" &&
      String(node.name || "").trim().toLowerCase() === F1_SHOP_CARD_TAG
  )
}

function getShopCardProductID(node) {
  const attrs = (node && node.attrs) || {}
  const pid = attrs["data-product-id"]
  return String(pid == null ? "" : pid).trim()
}

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

function buildGalleryBlock(images, idx) {
  const list = Array.isArray(images) ? images.filter((x) => x && x.src) : []
  return {
    id: `gallery_${idx}`,
    type: "gallery",
    images: list,
    localCount: list.length
  }
}

function normalizeGalleryIndex(index, total) {
  const t = Math.max(0, Number(total) || 0)
  if (!t) return 0
  let i = Number(index) || 0
  while (i < 0) i += t
  return i % t
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
      inlineImage: images[activeIndex] || null
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
    if (isShopCardNode(node)) {
      flushRich()
      flushGallery()
      const pid = getShopCardProductID(node)
      if (pid) {
        blocks.push({
          id: `shop_${blocks.length}_${pid}`,
          type: "product_card",
          productID: pid
        })
      }
      continue
    }
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
    statusBarHeight: 0,
    title: "",
    posterUrl: "",
    posterWidth: 0,
    posterHeight: 0,
    posterRatio: 0,
    posterHeroHeight: 0,
    posterLoaded: false,
    posterBroken: false,
    contentFormatCode: "PLAIN",
    contentText: "",
    contentBlocks: [],
    articleImages: [],
    viewerVisible: false,
    viewerInitialIndex: 0,
    publishedText: "",
    loading: false,
    errorText: ""
  },
  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      const w = Number(sys && sys.windowWidth) || 0
      this._windowWidth = w
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.applyI18n()
    this.refreshPoster({ silent: true })
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  applyI18n() {
    this.setData({ i18n: i18n.getDict() })
  },
  async refreshPoster(opts) {
    const silent = Boolean(opts && opts.silent)
    const cached = getPosterCache()
    if (cached && cached.item) {
      this.applyPoster(cached.item)
    }
    if (!silent || !cached) {
      try {
        if (!silent) this.setData({ loading: true, errorText: "" })
        const res = await fetchPoster(opts || {})
        if (res && res.item) {
          this.applyPoster(res.item)
        } else if (!cached) {
          this.setData({ errorText: "暂无海报" })
        }
      } catch (e) {
        if (!cached) {
          this.setData({ errorText: "加载失败，请稍后重试" })
        }
      } finally {
        this.setData({ loading: false })
      }
    }
  },
  applyPoster(item) {
    if (!item || !item.id) return
    const title = String(item.title || "").trim()
    const posterUrl = String(item.posterUrl || "").trim()
    const format = String(item.contentFormat || "RICH_TEXT_NODES").trim()
    const contentNodes = Array.isArray(item.contentNodes) ? item.contentNodes : []
    const articleImages = collectArticleImages(contentNodes)
    const contentBlocks = decorateGalleryBlocks(buildContentBlocks(contentNodes), articleImages)
    const publishedAt = String(item.publishedAt || item.createdAt || "").trim()
    let publishedText = ""
    if (publishedAt) {
      try {
        const d = new Date(publishedAt.replace(/-/g, "/"))
        if (Number.isFinite(d.getTime())) {
          const pad = (n) => (n < 10 ? `0${n}` : String(n))
          publishedText = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        }
      } catch (e) {}
    }
    const allImages = posterUrl
      ? [{ src: posterUrl, alt: title || "poster" }].concat(articleImages)
      : articleImages
    const winW = Number(this._windowWidth) || 0
    const pw = Number(item.posterWidth) || 0
    const ph = Number(item.posterHeight) || 0
    const ratio = Number(item.posterRatio) || 0
    let heroHeightPx = 0
    if (winW > 0) {
      if (pw > 0 && ph > 0) {
        heroHeightPx = Math.round((winW * ph) / pw)
      } else if (ratio > 0) {
        heroHeightPx = Math.round(winW / ratio)
      }
    }
    this.setData({
      title,
      posterUrl,
      posterWidth: pw,
      posterHeight: ph,
      posterRatio: ratio,
      posterHeroHeight: heroHeightPx > 0 ? heroHeightPx : 0,
      posterLoaded: false,
      posterBroken: !posterUrl,
      contentFormatCode: format,
      contentText: String(item.contentText || "").trim(),
      contentBlocks,
      articleImages: allImages,
      publishedText
    })
  },
  onBack() {
    wx.navigateBack({ delta: 1, fail: () => {} })
  },
  onPosterLoad() {
    this.setData({ posterLoaded: true, posterBroken: false })
  },
  onPosterError() {
    this.setData({ posterLoaded: false, posterBroken: true })
  },
  onPreviewPoster() {
    const url = String(this.data.posterUrl || "").trim()
    if (!url) return
    const urls = this.data.articleImages && this.data.articleImages.length
      ? this.data.articleImages.map((x) => x.src).filter(Boolean)
      : [url]
    wx.previewImage({ current: url, urls })
  },
  onTapGallery(e) {
    const idx = Number(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.blockIndex)
    const initial = Number.isFinite(idx) && this.data.contentBlocks && this.data.contentBlocks[idx]
      ? Number(this.data.contentBlocks[idx].activeIndex) || 0
      : 0
    this.setData({
      viewerVisible: true,
      viewerInitialIndex: initial
    })
  },
  onViewerClose() {
    this.setData({ viewerVisible: false })
  }
})
