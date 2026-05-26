const { getMockNewsList, LAYOUT_CODE } = require("../../services/newsService")

const WELCOME_KEY = "news_welcome_shown_v1"

Page({
  data: {
    banners: [],
    list: [],
    welcome: null,
    showWelcome: false
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
    const breaking = list.find((x) => x && x.layoutCode === LAYOUT_CODE.BREAKING) || null
    const heroBanners = list.filter((x) => x && x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER")
    const banners = breaking ? [breaking, ...heroBanners] : heroBanners
    const rest = list.filter((x) => {
      if (!x) return false
      if (breaking && x.id === breaking.id) return false
      if (x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER") return false
      return true
    })

    let showWelcome = false
    if (breaking) {
      const shown = Boolean(wx.getStorageSync(WELCOME_KEY))
      showWelcome = !shown
      if (showWelcome) {
        wx.setStorageSync(WELCOME_KEY, "1")
      }
    }

    this.setData({ banners, list: rest, welcome: breaking, showWelcome }, () => {
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
  },
  onCloseWelcome() {
    this.setData({ showWelcome: false })
  },
  noop() {}
})
