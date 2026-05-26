const { getMockNewsList, LAYOUT_CODE } = require("../../services/newsService")

Page({
  data: {
    banners: [],
    list: []
  },
  onLoad() {
    this.reload()
  },
  onShow() {
    if (typeof this.getTabBar === "function") {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === "function") {
        tb.setSelectedByRoute(this.route)
      }
    }
  },
  onPullDownRefresh() {
    this.reload({ stopRefresh: true })
  },
  reload(opts) {
    const list = getMockNewsList()
    const banners = list.filter((x) => x && x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER")
    const rest = list.filter((x) => !(x && x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER"))
    this.setData({ banners, list: rest }, () => {
      if (opts && opts.stopRefresh) {
        wx.stopPullDownRefresh()
      }
    })
    if (opts && opts.stopRefresh) {
      setTimeout(() => {
        wx.stopPullDownRefresh()
      }, 800)
    }
  },
  onReachBottom() {
    wx.showToast({ title: "已到底", icon: "none" })
  },
  onTapCard(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/news-detail/index?id=${encodeURIComponent(id)}` })
  }
})
