Page({
  onShow() {
    try {
      const app = getApp()
      const hideNews = Boolean(app && app.globalData && app.globalData.tweakAEffective)
      wx.switchTab({ url: hideNews ? "/pages/archive/index" : "/pages/news/index" })
    } catch (e) {}
  }
})
