const i18n = require("../../services/i18n")
const { computeTabbarReserveStyle } = require("../../utils/tabbar-layout")

const BASE_TAB_DEFS = [
  { key: "news",    icon: "document", labelKey: "nav.news",    fallback: "资讯" },
  { key: "archive", icon: "barrage",  labelKey: "nav.archive", fallback: "归档" },
  { key: "mine",    icon: "mine",     labelKey: "nav.mine",    fallback: "我的" }
]

const LOG_TAG = "[TABS-HOST]"

function resolveTabLabel(def, dict) {
  const d = dict && dict.nav ? dict.nav : {}
  return String(d[def.labelKey] || def.fallback || def.key)
}

Page({
  data: {
    i18n: i18n.getDict(),
    tabList: [],
    tabIdx: 1,
    currentItemId: "archive",
    showNews: true,
    newsIdx: 0,
    archiveIdx: 1,
    mineIdx: 2,
    statusBarHeight: 0,
    tabbarReserveRpx: 200,
    swiperStyle: "",
    hostTabbarStyle: "",
    indicatorStyle: "width:0px;transform:translateX(0px) translateY(-50%);",
    tabbarVisible: true,
    _workletEnabled: false
  },

  _tabsGeometry: null,
  _lastSwiperWidth: 0,
  _lastTransitionTs: 0,
  _transitionThrottleMs: 4,
  _switchingLock: false,
  _switchingGuard: null,

  onLoad(options) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    const layout = computeTabbarReserveStyle()
    let statusBarHeight = 0
    let pxPerRpx = 0
    let windowWidth = 0
    try {
      const sys = wx.getSystemInfoSync()
      statusBarHeight = Number(sys.statusBarHeight) || 0
      windowWidth = Number(sys.windowWidth) || 0
      const screenWidth = Number(sys.screenWidth) || windowWidth
      pxPerRpx = screenWidth > 0 ? screenWidth / 750 : windowWidth / 750
    } catch (e) {}
    this._pxPerRpx = pxPerRpx
    this._windowWidth = windowWidth

    this.applyI18n()

    const app = getApp()
    const hideNews = Boolean(app && app.globalData && app.globalData.tweakAEffective)
    const initialTab = this.resolveInitialTab(options, hideNews)

    this.rebuildTabList(hideNews, initialTab, {
      statusBarHeight,
      tabbarReserveRpx: layout.tabbarReserveRpx,
      swiperStyle: layout.scrollViewStyle.replace("height:", "height:")
    })

    this.initWorklet()
  },

  resolveInitialTab(options, hideNews) {
    const fromQuery = String((options && options.tab) || "").trim().toLowerCase()
    if (fromQuery === "news" && !hideNews) return "news"
    if (fromQuery === "archive") return "archive"
    if (fromQuery === "mine") return "mine"

    try {
      const app = getApp()
      const stored = String(wx.getStorageSync("tabs_host_last_tab") || "").trim()
      if (stored === "news" && !hideNews) return stored
      if (stored === "archive" || stored === "mine") return stored
    } catch (e) {}

    try {
      const app = getApp()
      const defaultTab = String((app && app.globalData && app.globalData.tabsHostDefaultTab) || "").trim()
      if (defaultTab === "news" && !hideNews) return defaultTab
      if (defaultTab === "archive" || defaultTab === "mine") return defaultTab
    } catch (e) {}

    return hideNews ? "archive" : "news"
  },

  rebuildTabList(hideNews, initialKey, extra) {
    const dict = this.data.i18n || i18n.getDict()
    const defs = hideNews ? BASE_TAB_DEFS.filter((x) => x.key !== "news") : BASE_TAB_DEFS.slice()
    const list = defs.map((d, idx) => ({
      key: d.key,
      icon: d.icon,
      label: resolveTabLabel(d, dict),
      _idx: idx
    }))

    let newsIdx = -1
    let archiveIdx = -1
    let mineIdx = -1
    for (const it of list) {
      if (it.key === "news") newsIdx = it._idx
      else if (it.key === "archive") archiveIdx = it._idx
      else if (it.key === "mine") mineIdx = it._idx
    }

    let tabIdx = archiveIdx
    for (const it of list) {
      if (it.key === initialKey) { tabIdx = it._idx; break }
    }
    if (tabIdx < 0) tabIdx = list[0] ? list[0]._idx : 0
    const currentItemId = (list[tabIdx] && list[tabIdx].key) || (list[0] && list[0].key) || ""

    const swiperHeightStyle = `width:100vw;height:100vh;`
    const safeBottomRpx = Math.max(0, Math.round((extra && extra.tabbarReserveRpx) || 200))
    const hostTabbarStyle = ``

    const setDataPayload = {
      tabList: list,
      showNews: !hideNews,
      newsIdx,
      archiveIdx,
      mineIdx,
      tabIdx,
      currentItemId,
      statusBarHeight: (extra && extra.statusBarHeight) || 0,
      tabbarReserveRpx: safeBottomRpx,
      swiperStyle: swiperHeightStyle,
      hostTabbarStyle
    }
    this.setData(setDataPayload, () => {
      wx.nextTick(() => this.measureTabGeometry())
    })
  },

  measureTabGeometry() {
    const list = this.data.tabList
    if (!list || !list.length) return
    const q = wx.createSelectorQuery().in(this)
    q.select("#host-tabbar-track").boundingClientRect()
    for (const it of list) {
      q.select(`#host-tab-${it.key}`).boundingClientRect()
    }
    q.exec((res) => {
      const track = res && res[0]
      if (!track) return
      const tabs = res.slice(1)
      const geoms = []
      let widthSum = 0
      for (let i = 0; i < list.length; i++) {
        const r = tabs[i] || { left: 0, width: 0 }
        const left = (r.left || 0) - (track.left || 0)
        const width = r.width || 0
        geoms.push({ left, width })
        widthSum += width
      }
      this._tabsGeometry = {
        trackLeft: track.left || 0,
        trackWidth: track.width || 0,
        tabs: geoms
      }
      this._lastSwiperWidth = this._windowWidth || (track && track.width) || 0
      this.syncIndicatorToIdx(this.data.tabIdx, { animated: false })
    })
  },

  initWorklet() {
    try {
      if (!wx.worklet) { this._workletEnabled = false; return }
      if (typeof this.applyAnimatedStyle !== "function") { this._workletEnabled = false; return }
      const { shared } = wx.worklet
      if (typeof shared !== "function") { this._workletEnabled = false; return }

      this._wi = shared(0)
      this._wx_val = shared(0)
      this._workletEnabled = true
    } catch (e) {
      this._workletEnabled = false
    }
  },

  applyIndicatorWorkletStyle() {
    if (!this._workletEnabled) return
    if (this._indicatorWorkletApplied) return
    try {
      if (typeof this.applyAnimatedStyle !== "function") return
      this._indicatorWorkletApplied = true
      const wi = this._wi
      const wxVal = this._wx_val
      wx.nextTick(() => {
        try {
          this.applyAnimatedStyle("#host-tab-indicator", () => {
            "worklet"
            return {
              width: `${wxVal.value}px`,
              transform: `translateX(${wi.value}px) translateY(-50%)`
            }
          })
        } catch (e) {}
      })
    } catch (e) {}
  },

  syncIndicatorToIdx(idx, opts) {
    const animated = !(opts && opts.animated === false)
    const geoms = this._tabsGeometry && this._tabsGeometry.tabs ? this._tabsGeometry.tabs : []
    if (!geoms.length) return
    const clamped = Math.max(0, Math.min(geoms.length - 1, Number(idx) || 0))
    const g = geoms[clamped]
    if (!g) return
    this.applyIndicatorWorkletStyle()

    if (this._workletEnabled && wx.worklet && wx.worklet.runOnUI) {
      try {
        const { runOnUI, timing, Easing } = wx.worklet
        const wi = this._wi
        const wxVal = this._wx_val
        runOnUI(() => {
          "worklet"
          const ease = Easing && Easing.inOut ? Easing.inOut(Easing.quad) : undefined
          if (animated) {
            wi.value = timing(g.left, { duration: 280, easing: ease })
            wxVal.value = timing(g.width, { duration: 280, easing: ease })
          } else {
            wi.value = g.left
            wxVal.value = g.width
          }
        })()
        return
      } catch (e) {}
    }
    const tr = animated ? "transition: width 280ms cubic-bezier(0.22,1,0.36,1), transform 280ms cubic-bezier(0.22,1,0.36,1);" : "transition:none;"
    this.setData({ indicatorStyle: `width:${g.width}px;transform:translateX(${g.left}px) translateY(-50%);${tr}` })
  },

  lerpIndicatorByProgress(progress) {
    const geoms = this._tabsGeometry && this._tabsGeometry.tabs ? this._tabsGeometry.tabs : []
    if (!geoms.length) return
    const n = geoms.length - 1
    const p = Math.max(0, Math.min(n, Number(progress) || 0))
    const iLow = Math.floor(p)
    const iHigh = Math.min(n, iLow + 1)
    const t = Math.max(0, Math.min(1, p - iLow))
    const a = geoms[iLow] || { left: 0, width: 0 }
    const b = geoms[iHigh] || a
    const left = a.left + (b.left - a.left) * t
    const width = a.width + (b.width - a.width) * t
    this.applyIndicatorWorkletStyle()

    if (this._workletEnabled && this._wi && this._wx_val) {
      try {
        const { runOnUI } = wx.worklet
        const wi = this._wi
        const wxVal = this._wx_val
        runOnUI(() => {
          "worklet"
          wi.value = left
          wxVal.value = width
        })()
        return
      } catch (e) {}
    }
    this.setData({ indicatorStyle: `width:${width}px;transform:translateX(${left}px) translateY(-50%);transition:none;` })
  },

  onSwiperTransition(e) {
    const now = Date.now()
    if (now - this._lastTransitionTs < this._transitionThrottleMs) return
    this._lastTransitionTs = now

    const dx = Number((e && e.detail && e.detail.dx) || 0)
    const sw = this._lastSwiperWidth || Math.max(1, Number((e && e.detail && e.detail.width) || 0))
    const curIdx = Number(this.data.tabIdx) || 0
    const progress = curIdx - (dx / Math.max(1, sw))
    this.lerpIndicatorByProgress(progress)
  },

  onSwiperChange(e) {
    const idx = Number((e && e.detail && e.detail.current) || 0)
    const itemId = String((e && e.detail && e.detail.currentItemId) || "")
    const fromKey = this.data.tabList[this.data.tabIdx] && this.data.tabList[this.data.tabIdx].key
    const toItem = this.data.tabList[idx]
    const toKey = toItem && toItem.key
    const resolvedItemId = itemId || toKey || ""
    this.setData({ tabIdx: idx, currentItemId: resolvedItemId })
    this.syncIndicatorToIdx(idx, { animated: true })
    this.notifyPanelsShowHide(fromKey, toKey)
    try {
      if (toKey) wx.setStorageSync("tabs_host_last_tab", toKey)
    } catch (e) {}
    try {
      const app = getApp()
      if (app && app.globalData) app.globalData.tabsHostCurrentTab = toKey
    } catch (e) {}
  },

  onSwiperAnimationFinish(e) {
    const idx = Number((e && e.detail && e.detail.current) || 0)
    this.syncIndicatorToIdx(idx, { animated: true })
    clearTimeout(this._switchingGuard)
    this._switchingLock = false
  },

  notifyPanelsShowHide(fromKey, toKey) {
    const panelByKey = {
      news: "#panel-news",
      archive: "#panel-archive",
      mine: "#panel-mine"
    }
    if (fromKey && fromKey !== toKey) {
      const p = this.selectComponent(panelByKey[fromKey])
      if (p && typeof p.onPanelHide === "function") {
        try { p.onPanelHide() } catch (e) {}
      }
    }
    if (toKey) {
      const p = this.selectComponent(panelByKey[toKey])
      if (p && typeof p.onPanelShow === "function") {
        try { p.onPanelShow() } catch (e) {}
      }
    }
  },

  onTapTab(e) {
    try {
      const idx = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.idx) || -1)
      const key = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || ""
      if (idx < 0 || !key) return
      if (this._switchingLock) return
      const list = this.data.tabList || []
      const target = list.find((it) => it.key === key)
      if (!target) return
      if (target._idx === this.data.tabIdx) {
        this.syncIndicatorToIdx(target._idx, { animated: true })
        return
      }
      this._switchingLock = true
      clearTimeout(this._switchingGuard)
      this._switchingGuard = setTimeout(() => { this._switchingLock = false }, 450)

      const fromKey = (this.data.tabList[this.data.tabIdx] || {}).key
      const toKey = key
      const toIdx = target._idx

      this.syncIndicatorToIdx(toIdx, { animated: true })
      this.setData({ tabIdx: toIdx, currentItemId: toKey }, () => {
        wx.nextTick(() => {
          try {
            if (this.data.currentItemId !== toKey) {
              this.setData({ tabIdx: toIdx, currentItemId: toKey })
            }
          } catch (e) {}
          this.notifyPanelsShowHide(fromKey, toKey)
          try {
            if (toKey) wx.setStorageSync("tabs_host_last_tab", toKey)
          } catch (e) {}
          try {
            const app = getApp()
            if (app && app.globalData) app.globalData.tabsHostCurrentTab = toKey
          } catch (e) {}
        })
      })
    } catch (err) {
      try { this._switchingLock = false } catch (e) {}
      console.error(LOG_TAG + " onTapTab error", err && err.message || err)
    }
  },

  applyI18n() {
    const dict = i18n.getDict()
    const hideNews = !this.data.showNews
    const list = this.data.tabList
    if (list && list.length) {
      const relabeled = list.map((it) => {
        const def = BASE_TAB_DEFS.find((d) => d.key === it.key)
        if (!def) return it
        return { ...it, label: resolveTabLabel(def, dict) }
      })
      this.setData({ tabList: relabeled, i18n: dict }, () => {
        wx.nextTick(() => this.measureTabGeometry())
      })
    } else {
      this.setData({ i18n: dict })
    }
    wx.setNavigationBarTitle && wx.setNavigationBarTitle({ title: dict.nav && dict.nav.appTitle ? dict.nav.appTitle : "TONIC F1" })
  },

  onShow() {
    const app = getApp()
    const hideNews = Boolean(app && app.globalData && app.globalData.tweakAEffective)
    const showNews = !hideNews
    if (showNews !== this.data.showNews) {
      let keyNow = (this.data.tabList[this.data.tabIdx] || {}).key || "archive"
      if (hideNews && keyNow === "news") keyNow = "archive"
      this.rebuildTabList(hideNews, keyNow, {
        statusBarHeight: this.data.statusBarHeight,
        tabbarReserveRpx: this.data.tabbarReserveRpx
      })
    } else {
      this.applyI18n()
    }
    const curKey = (this.data.tabList[this.data.tabIdx] || {}).key
    this.notifyPanelsShowHide(null, curKey)
  },

  onReady() {
    wx.nextTick(() => this.measureTabGeometry())
  },

  onUnload() {
    if (this._offLocale) this._offLocale()
    clearTimeout(this._switchingGuard)
  },

  switchTabByKey(key) {
    try {
      const k = String(key || "").trim()
      if (!k) return
      if (this._switchingLock) return
      let it = this.data.tabList.find((x) => x.key === k)
      if (!it) {
        if (k === "news" && !this.data.showNews) {
          it = this.data.tabList.find((x) => x.key === "archive") || this.data.tabList[0]
        }
        if (!it) return
      }
      if (it._idx === this.data.tabIdx) { this.syncIndicatorToIdx(it._idx, { animated: true }); return }

      this._switchingLock = true
      clearTimeout(this._switchingGuard)
      this._switchingGuard = setTimeout(() => { this._switchingLock = false }, 450)

      const fromKey = (this.data.tabList[this.data.tabIdx] || {}).key
      const toKey = it.key
      const toIdx = it._idx

      this.syncIndicatorToIdx(toIdx, { animated: true })
      this.setData({ tabIdx: toIdx, currentItemId: toKey }, () => {
        wx.nextTick(() => {
          try {
            if (this.data.currentItemId !== toKey) {
              this.setData({ tabIdx: toIdx, currentItemId: toKey })
            }
          } catch (e) {}
          this.notifyPanelsShowHide(fromKey, toKey)
          try { wx.setStorageSync("tabs_host_last_tab", toKey) } catch (e) {}
          try {
            const app = getApp()
            if (app && app.globalData) app.globalData.tabsHostCurrentTab = toKey
          } catch (e) {}
        })
      })
    } catch (err) {
      try { this._switchingLock = false } catch (e) {}
      console.error(LOG_TAG + " switchTabByKey error", err && err.message || err)
    }
  },

  getActivePanel() {
    const key = (this.data.tabList[this.data.tabIdx] || {}).key
    const ref = key === "news" ? "#panel-news" : key === "archive" ? "#panel-archive" : key === "mine" ? "#panel-mine" : ""
    if (!ref) return null
    return this.selectComponent(ref)
  },

  onPanelRequestSwitchTab(e) {
    const key = (e && e.detail && e.detail.key) || ""
    if (!key) return
    this.switchTabByKey(key)
  },

  onPanelSetTabbarVisible(e) {
    const visible = Boolean(e && e.detail && e.detail.visible)
    if (this.data.tabbarVisible !== visible) {
      this.setData({ tabbarVisible: visible })
    }
  }
})
