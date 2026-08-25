const { fetchNewsDetail } = require("../../../../services/mpNewsApi")
const i18n = require("../../../../services/i18n")
const { getWeChatStoreConfig } = require("../../../../services/wechatStore")

const F1_SHOP_CARD_TAG = "f1-shop-card"
const EMBEDDED_STORE_STYLE = {
  card: {
    "background-color": "#08080D"
  },
  title: {
    color: "rgba(255, 255, 255, 0.92)"
  },
  price: {
    color: "#FF6A57"
  },
  "buy-button": {
    width: "116px",
    "border-radius": "999px",
    "background-color": "#E10600",
    color: "#FFFFFF"
  },
  "buy-button-disabled": {
    width: "116px",
    "border-radius": "999px",
    "background-color": "#4D1212",
    color: "rgba(255, 255, 255, 0.58)"
  }
}

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

function normalizeGalleryIndex(index, total) {
  const t = Math.max(0, Number(total) || 0)
  if (!t) return 0
  let i = Number(index) || 0
  while (i < 0) i += t
  return i % t
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
          productID: pid,
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
    id: "",
    title: "",
    tagText: "",
    timeText: "",
    contentFormatCode: "PLAIN",
    contentText: "",
    contentNodes: [],
    contentBlocks: [],
    articleImages: [],
    viewerVisible: false,
    viewerInitialIndex: 0,
    storeAppId: "",
    embeddedStoreStyle: EMBEDDED_STORE_STYLE,
    storeProductErrorText: "",
    loading: false,
    errorText: ""
  },
  onShareAppMessage() {
    const id = String(this.data.id || "").trim()
    const title = String(this.data.title || "").trim() || i18n.t("newsDetail.title")
    const path = id ? `/packages/news-pkg/pages/news-detail/index?id=${encodeURIComponent(id)}` : "/pages/news/index"
    return { title, path }
  },
  onLoad(query) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    this.syncStoreProductConfig()
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
  },
  onTapGallery(e) {
    const blockIndex = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.blockIndex) || -1)
    const blocks = Array.isArray(this.data.contentBlocks) ? this.data.contentBlocks : []
    const block = blockIndex >= 0 ? blocks[blockIndex] : null
    const images = Array.isArray(this.data.articleImages) ? this.data.articleImages : []
    if (!images.length) return
    const viewerInitialIndex = normalizeGalleryIndex(block && block.activeIndex, images.length)
    this.setData({
      viewerVisible: true,
      viewerInitialIndex
    })
  },
  onViewerClose() {
    this.setData({ viewerVisible: false })
  },
  onStoreProductEnterSuccess() {
    if (!this.data.storeProductErrorText) return
    this.setData({ storeProductErrorText: "" })
  },
  onStoreProductEnterError(e) {
    const detail = (e && e.detail) || {}
    const message = String(detail.message || "").trim()
    this.setData({
      storeProductErrorText: message
        ? `${i18n.t("newsDetail.recommendEnterFailedPrefix")}${message}`
        : i18n.t("newsDetail.recommendEnterFailed")
    })
  },
  syncStoreProductConfig() {
    const cfg = getWeChatStoreConfig()
    this.setData({
      storeAppId: String(cfg.appId || "").trim()
    })
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
    const tt = String(this.data.title || "").trim()
    wx.setNavigationBarTitle({ title: tt || dict.newsDetail.title })
  }
})
