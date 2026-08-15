const i18n = require("../../services/i18n")
const { fetchShopProductDetail, priceFenToYuanText } = require("../../services/shopApi")
const { getWeChatStoreConfig } = require("../../services/wechatStore")

Page({
  data: {
    i18n: i18n.getDict(),
    productID: "",
    product: null,
    priceText: "-",
    marketPriceText: "",
    loading: false,
    errorText: "",
    storeAppId: "",
  },
  onShareAppMessage() {
    const p = this.data.product || {}
    const title = String(p.title || this.data.i18n.shop.detailTitle || "").trim() || this.data.i18n.shop.detailTitle
    const path = `/pages/shop-detail/index?id=${encodeURIComponent(this.data.productID)}`
    return { title, path }
  },
  onLoad(options) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    const cfg = getWeChatStoreConfig()
    this.setData({ storeAppId: String(cfg.appId || "").trim() })
    const id = String((options && options.id) || "").trim()
    if (!id) {
      this.setData({ errorText: i18n.t("newsDetail.missingId") || "missing id" })
      return
    }
    this.setData({ productID: id })
    this.load()
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n()
  },
  load() {
    this.setData({ loading: true, errorText: "" })
    fetchShopProductDetail(this.data.productID)
      .then((res) => {
        const p = (res && res.product) || null
        const skus = p && Array.isArray(p.skus)
          ? p.skus.map((s) => {
              const attrs = Array.isArray(s.sku_attrs) ? s.sku_attrs : []
              const specLabel = attrs.length
                ? attrs.map((a) => `${a.name || ""}:${a.value || ""}`).filter(Boolean).join(" / ")
                : (s.sku_code ? `编码 ${s.sku_code}` : (String(s.sku_id || "").trim() ? `SKU ${s.sku_id}` : "默认规格"))
              return Object.assign({}, s, {
                _specLabel: specLabel,
                _priceText: priceFenToYuanText(s && s.sale_price),
              })
            })
          : null
        const product = p && skus ? Object.assign({}, p, { skus }) : p
        this.setData(
          {
            product,
            priceText: priceFenToYuanText(product && product.min_price),
            marketPriceText: priceFenToYuanText(product && product.market_price),
            loading: false,
          },
          () => this.applyI18n()
        )
      })
      .catch((err) => {
        const msg = String(err && err.message ? err.message : err || "加载失败")
        this.setData({ loading: false, errorText: msg })
      })
  },
  onTapBuy() {
    const pid = String(this.data.productID || "").trim()
    const appid = String(this.data.storeAppId || "").trim()
    if (pid && appid) {
      wx.openEmbeddedMiniProgram({
        appId: appid,
        path: `pages/product/detail?product_id=${encodeURIComponent(pid)}`,
        fail: () => {
          wx.showToast({ title: "唤起小商店失败", icon: "none" })
        },
      })
      return
    }
    wx.showToast({ title: "小商店未配置", icon: "none" })
  },
  applyI18n() {
    const dict = i18n.getDict()
    const p = this.data.product
    const title = p && p.title ? String(p.title).trim() : dict.shop && dict.shop.detailTitle ? dict.shop.detailTitle : "商品详情"
    this.setData({ i18n: dict })
    wx.setNavigationBarTitle({ title })
  },
})
