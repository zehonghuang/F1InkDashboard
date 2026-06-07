const i18n = require("../../services/i18n")
const { listProducts } = require("../../services/shopMock")

function formatPriceCny(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "-"
  return `¥${Math.round(n)}`
}

Page({
  data: {
    i18n: i18n.getDict(),
    items: []
  },
  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    this.reload()
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n()
  },
  onPullDownRefresh() {
    try {
      this.reload()
    } finally {
      try {
        wx.stopPullDownRefresh()
      } catch (e) {}
    }
  },
  reload() {
    const raw = listProducts()
    const items = (raw || []).map((p) => {
      return Object.assign({}, p, { priceText: formatPriceCny(p && p.priceCny) })
    })
    this.setData({ items })
  },
  onTapItem(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset ? String(e.currentTarget.dataset.id || "") : ""
    if (!id) return
    wx.navigateTo({ url: `/pages/shop-detail/index?id=${encodeURIComponent(id)}` })
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
    wx.setNavigationBarTitle({ title: dict.shop.title })
  }
})

