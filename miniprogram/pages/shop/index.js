const i18n = require("../../services/i18n")
const { getWeChatStoreConfig, openWeChatStore } = require("../../services/wechatStore")

Page({
  data: {
    i18n: i18n.getDict(),
    storeAppId: ""
  },
  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    this.syncStoreConfig()
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n()
    this.syncStoreConfig()
  },
  onPullDownRefresh() {
    try {
      this.syncStoreConfig()
    } finally {
      try {
        wx.stopPullDownRefresh()
      } catch (e) {}
    }
  },
  syncStoreConfig() {
    const cfg = getWeChatStoreConfig()
    const appId = String(cfg.appId || "").trim()
    const maskedAppId =
      appId && appId.length > 10 ? `${appId.slice(0, 8)}...${appId.slice(-4)}` : appId
    this.setData({ storeAppId: maskedAppId })
  },
  onTapOpenStore() {
    openWeChatStore()
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
    wx.setNavigationBarTitle({ title: dict.shop.title })
  }
})

