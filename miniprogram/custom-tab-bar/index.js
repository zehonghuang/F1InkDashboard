const LOG_TAG = "[TABBAR]"

const BASE_TABS = [
  {
    key: "news",
    pagePath: "pages/news/index",
    icon: "document",
    label: "资讯"
  },
  {
    key: "archive",
    pagePath: "pages/archive/index",
    icon: "barrage",
    label: "归档"
  },
  {
    key: "mine",
    pagePath: "pages/mine/index",
    icon: "mine",
    label: "我的"
  }
]

function normalizeRoute(p) {
  if (!p) return ""
  let s = String(p || "")
  if (s.charAt(0) === "/") s = s.slice(1)
  return s
}

function normalizeTabPath(p) {
  if (!p) return ""
  let s = String(p || "")
  if (s.charAt(0) === "/") s = s.slice(1)
  return s
}

Component({
  data: {
    visible: false,
    selected: "",
    list: [],
    switching: false
  },
  lifetimes: {
    attached() {
      try {
        const app = getApp()
        const pages = getCurrentPages()
        const top = pages && pages[pages.length - 1]
        const route = top && top.route
        if (route === "pages/news/index" || route === "pages/archive/index" || route === "pages/mine/index") {
          const key =
            route === "pages/news/index" ? "news" :
            route === "pages/archive/index" ? "archive" : "mine"
          wx.reLaunch({
            url: `/pages/tabs-host/index?tab=${encodeURIComponent(key)}&src=ctb_attached`,
            fail() {}
          })
        }
      } catch (e) {}
    },
    detached() {}
  },
  pageLifetimes: {
    show() {
      try {
        const pages = getCurrentPages()
        const top = pages && pages[pages.length - 1]
        const route = top && top.route
        if (route === "pages/news/index" || route === "pages/archive/index" || route === "pages/mine/index") {
          const key =
            route === "pages/news/index" ? "news" :
            route === "pages/archive/index" ? "archive" : "mine"
          wx.reLaunch({
            url: `/pages/tabs-host/index?tab=${encodeURIComponent(key)}&src=ctb_show`,
            fail() {}
          })
        }
      } catch (e) {}
    }
  },
  methods: {
    setVisible() { return },
    refreshTabs() { return },
    getSelectedFromCurrentRoute() { return "" },
    setSelectedByRoute() { return },
    onTapItem() { return }
  }
})
