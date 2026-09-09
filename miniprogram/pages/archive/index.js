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
        ? "?" + paramKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(opts[k])}`).join("&") + "&tab=archive&src=archive"
        : "?tab=archive&src=archive"
      wx.reLaunch({
        url: `/pages/tabs-host/index${query}`,
        fail(err) {
          console.warn("[ARCHIVE-SHELL] reLaunch tabs-host failed", err && err.errMsg)
        }
      })
      this._diverted = true
    } catch (e) {}
  },
  onShow() {
    if (this._diverted) return
    try {
      wx.reLaunch({ url: "/pages/tabs-host/index?tab=archive&src=archive_show", fail() {} })
      this._diverted = true
    } catch (e) {}
  },
  applyI18n() {
    this.setData({ i18n: i18n.getDict() })
  }
})
