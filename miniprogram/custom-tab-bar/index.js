const BASE_TABS = [
  {
    key: "news",
    pagePath: "/pages/news/index",
    icon: "document",
    label: "资讯"
  },
  {
    key: "archive",
    pagePath: "/pages/archive/index",
    icon: "barrage",
    label: "归档"
  },
  {
    key: "mine",
    pagePath: "/pages/mine/index",
    icon: "mine",
    label: "我的"
  }
]

Component({
  data: {
    visible: true,
    selected: "archive",
    list: [],
    switching: false
  },
  lifetimes: {
    attached() {
      this.refreshTabs()
    },
    detached() {
      clearTimeout(this._switchTimer)
    }
  },
  pageLifetimes: {
    show() {
      this.refreshTabs()
    }
  },
  methods: {
    getSelectedFromCurrentRoute(list) {
      const tabs = Array.isArray(list) ? list : []
      const pages = getCurrentPages()
      const currentPage = pages && pages.length ? pages[pages.length - 1] : null
      const currentRoute = currentPage && currentPage.route ? `/${currentPage.route}` : ""
      const matched = tabs.find((x) => x && x.pagePath === currentRoute)
      return matched ? matched.key : ""
    },
    setVisible(visible) {
      this.setData({ visible: Boolean(visible) })
    },
    refreshTabs() {
      const app = getApp()
      const hideNewsTab =
        app &&
        app.globalData &&
        Boolean(app.globalData.tweakAEffective)

      const list = hideNewsTab ? BASE_TABS.filter((x) => x.key !== "news") : BASE_TABS.slice()
      const currentSelected = this.getSelectedFromCurrentRoute(list)
      const selected =
        currentSelected ||
        (list.find((x) => x.key === this.data.selected) && this.data.selected) ||
        (list[0] && list[0].key) ||
        ""

      this.setData({
        list,
        selected
      })
    },
    setSelectedByRoute(route) {
      const matched = this.data.list.find((x) => x.pagePath === `/${route}`)
      const fallback = (this.data.list[0] && this.data.list[0].key) || ""
      const selected = matched ? matched.key : fallback
      this.setData({ selected })
    },
    onTapItem(e) {
      if (this.data.switching) return
      const { key } = e.currentTarget.dataset
      const item = this.data.list.find((x) => x.key === key)
      if (!item) return
      const pages = getCurrentPages()
      const currentPage = pages && pages.length ? pages[pages.length - 1] : null
      const currentRoute = currentPage && currentPage.route ? `/${currentPage.route}` : ""
      if (currentRoute && currentRoute === item.pagePath) return

      this.setData({ selected: key })
      this.setData({ switching: true })

      wx.switchTab({
        url: item.pagePath,
        complete: () => {
          this.setData({ switching: false })
        }
      })
    }
  }
})
