const i18n = require("../../services/i18n")
const { getProduct } = require("../../services/shopMock")
const { openWeChatStore } = require("../../services/wechatStore")

function formatPriceCny(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "-"
  return `¥${Math.round(n)}`
}

Page({
  data: {
    i18n: i18n.getDict(),
    product: null,
    priceText: "-"
  },
  onLoad(options) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    const id = String((options && options.id) || "").trim()
    const product = getProduct(id)
    this.setData({ product, priceText: formatPriceCny(product && product.priceCny) }, () => this.applyI18n())
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n()
  },
  onTapBuy() {
    openWeChatStore()
  },
  applyI18n() {
    const dict = i18n.getDict()
    const title = this.data.product && this.data.product.title ? this.data.product.title : dict.shop.detailTitle
    this.setData({ i18n: dict })
    wx.setNavigationBarTitle({ title })
  }
})

