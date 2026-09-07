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
    visible: true,
    selected: "archive",
    list: [],
    switching: false
  },
  lifetimes: {
    attached() {
      console.log(LOG_TAG, "✅ attached. this.data.selected=", this.data.selected)
      try {
        const sys = wx.getSystemInfoSync()
        console.log(LOG_TAG, "📱 safeArea.bottom=", sys.safeArea && sys.safeArea.bottom, "windowHeight=", sys.windowHeight, "statusBarHeight=", sys.statusBarHeight)
        console.log(LOG_TAG, "📱 safeAreaInsets.bottom=", sys.safeAreaInsets && sys.safeAreaInsets.bottom)
      } catch (e) {
        console.log(LOG_TAG, "⚠️ getSystemInfoSync failed", e)
      }
      this.refreshTabs()
    },
    detached() {
      clearTimeout(this._switchingGuard)
    }
  },
  pageLifetimes: {
    show() {
      console.log(LOG_TAG, "👀 pageLifetimes.show() fired. BEFORE this.data.selected=", this.data.selected, "switching=", this.data.switching)
      this.setData({ switching: false })
      this.setVisible(true)
      const app = getApp()
      const hideNewsTab =
        app &&
        app.globalData &&
        Boolean(app.globalData.tweakAEffective)
      console.log(LOG_TAG, "👀 hideNewsTab?=", !!hideNewsTab, "tweakAEffective?=", app && app.globalData && app.globalData.tweakAEffective)
      const list = hideNewsTab ? BASE_TABS.filter((x) => x.key !== "news") : BASE_TABS.slice()
      const currentSelected = this.getSelectedFromCurrentRoute(list)
      console.log(LOG_TAG, "👀 getSelectedFromCurrentRoute =>", currentSelected, " | this.data.list keys=", list.map((x) => x.key).join(","))
      const selected =
        currentSelected ||
        (list.find((x) => x.key === this.data.selected) && this.data.selected) ||
        (list[0] && list[0].key) ||
        ""
      if (selected && selected !== this.data.selected) {
        console.log(LOG_TAG, "👀 will OVERWRITE selected from", this.data.selected, "→", selected)
        this.setData({ list, selected })
      } else if (this._lastListHash !== String(list.map((x) => x.key).join("|"))) {
        console.log(LOG_TAG, "👀 list structure changed, updating list only")
        this.setData({ list })
      } else {
        console.log(LOG_TAG, "👀 no change, skip setData. this.data.selected remains", this.data.selected)
      }
      this._lastListHash = String(list.map((x) => x.key).join("|"))
    }
  },
  methods: {
    getSelectedFromCurrentRoute(list) {
      const tabs = Array.isArray(list) ? list : []
      const pages = getCurrentPages()
      const currentPage = pages && pages.length ? pages[pages.length - 1] : null
      const currentRoute = normalizeRoute(currentPage && currentPage.route)
      console.log(LOG_TAG, "🔍 getCurrentPages().length=", pages.length, "topPage.route=", currentPage && currentPage.route, "normalized=>", currentRoute)
      const matched = tabs.find((x) => x && normalizeTabPath(x.pagePath) === currentRoute)
      console.log(LOG_TAG, "🔍 matched key?=", matched ? matched.key : "<none>")
      return matched ? matched.key : ""
    },
    setVisible(visible) {
      const next = Boolean(visible)
      if (this.data.visible !== next) {
        console.log(LOG_TAG, "👁️  setVisible:", this.data.visible, "→", next)
        this.setData({ visible: next })
      }
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

      console.log(LOG_TAG, "♻️ refreshTabs → list keys=", list.map((x) => x.key).join(","), "selected=", selected, "(prev was=", this.data.selected, ")")
      this.setData({ list, selected })
      this._lastListHash = String(list.map((x) => x.key).join("|"))
    },
    setSelectedByRoute(route) {
      const target = normalizeRoute(route)
      console.log(LOG_TAG, "🎯 setSelectedByRoute called. route arg=", route, "normalized=>", target)
      const matched = this.data.list.find((x) => normalizeTabPath(x.pagePath) === target)
      const fallback = (this.data.list[0] && this.data.list[0].key) || ""
      const selected = matched ? matched.key : fallback
      console.log(LOG_TAG, "🎯 matched=", matched ? matched.key : "<none>", "fallback=", fallback, "→ will set selected=", selected, "(current=", this.data.selected, ")")
      if (selected) this.setData({ selected })
    },
    onTapItem(e) {
      console.log(LOG_TAG, "👆 onTapItem FIRED. raw event=", JSON.stringify(e && e.detail), "dataset=", JSON.stringify(e && e.currentTarget && e.currentTarget.dataset))
      const { key } = (e && e.currentTarget && e.currentTarget.dataset) || {}
      console.log(LOG_TAG, "👆 clicked key=", key, " | switching=", this.data.switching, "selected=", this.data.selected, "list.length=", this.data.list.length)
      if (this.data.switching) {
        console.log(LOG_TAG, "👆 ❌ EARLY RETURN: switching=true still locked.")
        return
      }
      const item = this.data.list.find((x) => x.key === key)
      if (!item) {
        console.log(LOG_TAG, "👆 ❌ EARLY RETURN: no tab in this.data.list with key=", key, "list=", JSON.stringify(this.data.list))
        return
      }
      const targetPath = normalizeTabPath(item.pagePath)
      console.log(LOG_TAG, "👆 item.pagePath raw=", item.pagePath, "normalized targetPath=", targetPath)

      const pages = getCurrentPages()
      const currentPage = pages && pages.length ? pages[pages.length - 1] : null
      const currentRoute = normalizeRoute(currentPage && currentPage.route)
      console.log(LOG_TAG, "👆 currentRoute=", currentRoute, " | same?=", currentRoute && currentRoute === targetPath, "selected===key?=", this.data.selected === key)
      if (currentRoute && currentRoute === targetPath && this.data.selected === key) {
        console.log(LOG_TAG, "👆 ❌ EARLY RETURN: already on this tab, skip switch")
        return
      }

      console.log(LOG_TAG, "👆 ✅ setData({selected:", key, ", switching:true})")
      this.setData({ selected: key, switching: true })
      clearTimeout(this._switchingGuard)
      this._switchingGuard = setTimeout(() => {
        console.log(LOG_TAG, "⏰ switching guard timeout fired. Force switching=false.")
        this.setData({ switching: false })
      }, 800)

      const finalUrl = "/" + targetPath
      console.log(LOG_TAG, "📞 CALL wx.switchTab with url=", JSON.stringify(finalUrl))
      wx.switchTab({
        url: finalUrl,
        fail: (err) => {
          console.error(LOG_TAG, "📞 ❌ switchTab FAIL. url=", finalUrl, "err=", JSON.stringify(err), "errMsg=", err && err.errMsg)
          wx.showToast({ title: "切换失败: " + (err && err.errMsg || "unknown"), icon: "none", duration: 2500 })
          clearTimeout(this._switchingGuard)
          this.setData({ switching: false })
        },
        success: (res) => {
          console.log(LOG_TAG, "📞 ✅ switchTab SUCCESS. res=", JSON.stringify(res))
          this.setData({ selected: key })
        },
        complete: (res) => {
          console.log(LOG_TAG, "📞 switchTab COMPLETE. res=", JSON.stringify(res))
          clearTimeout(this._switchingGuard)
          this.setData({ switching: false })
        }
      })
    }
  }
})
