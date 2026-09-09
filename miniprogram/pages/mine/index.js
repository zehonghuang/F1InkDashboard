const i18n = require("../../services/i18n")

Page({
  data: {
    i18n: i18n.getDict()
  },
  onLoad(options) {
    this._diverted = false
    const opts = options || {}
    const paramKeys = Object.keys(opts)
    try {
      const query = paramKeys.length
        ? "?" + paramKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(opts[k])}`).join("&") + "&tab=mine&src=mine"
        : "?tab=mine&src=mine"
      wx.redirectTo({
        url: `/pages/tabs-host/index${query}`,
        fail(err) {
          console.warn("[MINE-SHELL] redirectTo tabs-host failed, fallback reLaunch", err && err.errMsg)
          try { wx.reLaunch({ url: "/pages/tabs-host/index?tab=mine" }) } catch (e) {}
        }
      })
      this._diverted = true
    } catch (e) {}
  },
  onShow() {
    if (this._diverted) return
    try {
      wx.redirectTo({ url: "/pages/tabs-host/index?tab=mine&src=mine_show", fail() {} })
      this._diverted = true
    } catch (e) {}
  },
  applyI18n() {
    this.setData({ i18n: i18n.getDict() })
  }
})
