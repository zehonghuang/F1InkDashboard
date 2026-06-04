const BASE_TABS = [
  {
    key: "news",
    pagePath: "/pages/news/index",
    icon: "document"
  },
  {
    key: "archive",
    pagePath: "/pages/archive/index",
    icon: "barrage"
  },
  {
    key: "mine",
    pagePath: "/pages/mine/index",
    icon: "mine"
  }
]

Component({
  data: {
    visible: true,
    selected: "archive",
    list: []
  },
  lifetimes: {
    attached() {
      this.refreshTabs()
    }
  },
  pageLifetimes: {
    show() {
      this.refreshTabs()
    }
  },
  methods: {
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
      const selected =
        (list.find((x) => x.key === this.data.selected) && this.data.selected) || (list[0] && list[0].key) || ""

      this.setData({ list, selected })
    },
    setSelectedByRoute(route) {
      const matched = this.data.list.find((x) => x.pagePath === `/${route}`)
      const fallback = (this.data.list[0] && this.data.list[0].key) || ""
      this.setData({ selected: matched ? matched.key : fallback })
    },
    onTapItem(e) {
      const { key } = e.currentTarget.dataset
      const item = this.data.list.find((x) => x.key === key)
      if (!item) return
      this.setData({ selected: key })
      wx.switchTab({ url: item.pagePath })
    }
  }
})
