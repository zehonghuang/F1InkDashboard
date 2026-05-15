Page({
  onShow() {
    if (typeof this.getTabBar === 'function') {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === 'function') {
        tb.setSelectedByRoute(this.route)
      }
    }
  },
  onPickMode() {
    wx.showToast({ title: "对比功能待接入", icon: "none" })
  }
})
