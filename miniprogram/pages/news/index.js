const { LAYOUT_CODE } = require("../../services/newsService")
const { fetchNewsList } = require("../../services/mpNewsApi")

const WELCOME_KEY = "news_welcome_shown_v1"

Page({
  data: {
    banners: [],
    list: [],
    welcome: null,
    showWelcome: false,
    loading: false,
    errorText: "",
    page: 1,
    pageSize: 20,
    hasMore: true,
    statusBarHeight: 0
  },
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.reload()
  },
  onShow() {
    if (typeof this.getTabBar === "function") {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === "function") {
        tb.setSelectedByRoute(this.route)
      }
      if (tb && typeof tb.setVisible === "function") {
        tb.setVisible(!this.data.showWelcome)
      }
    }
  },
  onPullDownRefresh() {
    this.reload({ stopRefresh: true, reset: true })
  },
  reload(opts) {
    if (this.data.loading) return
    const reset = !opts || opts.reset !== false
    const nextPage = reset ? 1 : Number((opts && opts.page) || this.data.page || 1)
    if (reset) {
      this.setData({ loading: true, errorText: "", page: 1, hasMore: true, banners: [], list: [], welcome: null, showWelcome: false })
    } else {
      this.setData({ loading: true, errorText: "" })
    }
    const done = () => {
      if (opts && opts.stopRefresh) {
        wx.stopPullDownRefresh()
      }
      this.setData({ loading: false })
    }

    fetchNewsList({ page: nextPage, pageSize: this.data.pageSize, tz: "Asia/Shanghai" })
      .then((res) => {
        const items = (res && res.items) || []
        if (reset) {
          const breaking = items.find((x) => x && x.layoutCode === LAYOUT_CODE.BREAKING) || null
          const heroBanners = items.filter((x) => x && x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER")
          const banners = breaking ? [breaking, ...heroBanners] : heroBanners
          const rest = items.filter((x) => {
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

          const hasMore = (Number(res.page || 1) * Number(res.pageSize || this.data.pageSize || 20)) < Number(res.total || 0)
          this.setData({ banners, list: rest, welcome: breaking, showWelcome, page: Number(res.page || 1), hasMore }, () => {
            if (typeof this.getTabBar === "function") {
              const tb = this.getTabBar()
              if (tb && typeof tb.setVisible === "function") {
                tb.setVisible(!showWelcome)
              }
            }
            done()
          })
          return
        }

        const bannerIds = new Set()
        for (const b of this.data.banners || []) {
          if (b && b.id) bannerIds.add(b.id)
        }
        const next = items.filter((x) => {
          if (!x || !x.id) return false
          if (bannerIds.has(x.id)) return false
          if (x.layoutCode === LAYOUT_CODE.BREAKING) return false
          if (x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER") return false
          return true
        })
        const seen = new Set((this.data.list || []).map((x) => (x && x.id ? x.id : "")))
        const merged = [...(this.data.list || [])]
        for (const it of next) {
          if (!it || !it.id || seen.has(it.id)) continue
          seen.add(it.id)
          merged.push(it)
        }
        const hasMore = (Number(res.page || 1) * Number(res.pageSize || this.data.pageSize || 20)) < Number(res.total || 0)
        this.setData({ list: merged, page: Number(res.page || 1), hasMore }, done)
      })
      .catch(() => {
        this.setData({ errorText: "加载失败，请下拉重试" }, () => done())
      })
  },
  onReachBottom() {
    if (this.data.loading) return
    if (!this.data.hasMore) {
      wx.showToast({ title: "已到底", icon: "none" })
      return
    }
    const nextPage = Number(this.data.page || 1) + 1
    this.reload({ reset: false, page: nextPage })
  },
  onTapCard(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/news-detail/index?id=${encodeURIComponent(id)}` })
  },
  onCloseWelcome() {
    this.setData({ showWelcome: false }, () => {
      if (typeof this.getTabBar === "function") {
        const tb = this.getTabBar()
        if (tb && typeof tb.setVisible === "function") {
          tb.setVisible(true)
        }
      }
    })
  },
  noop() {}
})
