Page({
  onShow() {
    if (typeof this.getTabBar === 'function') {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === 'function') {
        tb.setSelectedByRoute(this.route)
      }
    }
  },
  onTapItem() {
    wx.showToast({ title: "功能待接入", icon: "none" })
  }
})
