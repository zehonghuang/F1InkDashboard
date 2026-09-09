const i18n = require("./services/i18n")
const { DEFAULT_WECHAT_STORE_CONFIG } = require("./services/wechatStore")
const { DEFAULT_WECHAT_GROUP_CONFIG, fetchWeChatGroupConfig } = require("./services/wechatGroup")

const TAB_ROUTE_TO_KEY = {
  "pages/news/index": "news",
  "pages/archive/index": "archive",
  "pages/mine/index": "mine"
}

function setupTabsHostSwitchRedirect(app) {
  try {
    const origSwitchTab = wx.switchTab.bind(wx)
    wx.switchTab = function tabsHostAwareSwitchTab(options) {
      const url = String((options && options.url) || "").replace(/^\/+/, "")
      const key = TAB_ROUTE_TO_KEY[url]
      if (!key) {
        return origSwitchTab(options)
      }
      try {
        const pages = getCurrentPages()
        const n = pages ? pages.length : 0
        let hostPage = null
        let hostIndex = -1
        for (let i = n - 1; i >= 0; i--) {
          if (pages[i] && pages[i].route === "pages/tabs-host/index") {
            hostPage = pages[i]
            hostIndex = i
            break
          }
        }
        if (hostPage && typeof hostPage.switchTabByKey === "function") {
          if (hostIndex === n - 1) {
            try { hostPage.switchTabByKey(key) } catch (e) {}
            options && typeof options.success === "function" && options.success({ errMsg: "switchTab:ok via tabs-host (top)" })
            options && typeof options.complete === "function" && options.complete({ errMsg: "switchTab:ok via tabs-host (top)" })
            return
          }
          try {
            const backDelta = n - 1 - hostIndex
            let done = false
            wx.navigateBack({
              delta: backDelta,
              success() {
                try {
                  const pages2 = getCurrentPages()
                  const top2 = pages2 && pages2[pages2.length - 1]
                  if (top2 && top2.route === "pages/tabs-host/index" && typeof top2.switchTabByKey === "function") {
                    wx.nextTick(() => { try { top2.switchTabByKey(key) } catch (e) {} })
                  }
                  options && typeof options.success === "function" && options.success({ errMsg: "switchTab:ok via tabs-host (navigateBack)" })
                  done = true
                } catch (e) { done = true }
              },
              fail(err) {
                if (done) return
                wx.navigateTo({
                  url: `/pages/tabs-host/index?tab=${encodeURIComponent(key)}`,
                  success(res) { options && typeof options.success === "function" && options.success(res) },
                  fail(err2) { origSwitchTab(options) },
                  complete(res) { options && typeof options.complete === "function" && options.complete(res) }
                })
              },
              complete(res) {
                setTimeout(() => {
                  if (done) return
                  try {
                    const pages2 = getCurrentPages()
                    const top2 = pages2 && pages2[pages2.length - 1]
                    if (top2 && top2.route === "pages/tabs-host/index" && typeof top2.switchTabByKey === "function") {
                      try { top2.switchTabByKey(key) } catch (e) {}
                    }
                  } catch (e) {}
                }, 0)
              }
            })
            return
          } catch (e) {}
        }
      } catch (e) {}
      wx.reLaunch({
        url: `/pages/tabs-host/index?tab=${encodeURIComponent(key)}`,
        success(res) { options && typeof options.success === "function" && options.success(res) },
        fail(err) {
          origSwitchTab(options)
        },
        complete(res) { options && typeof options.complete === "function" && options.complete(res) }
      })
    }
  } catch (e) {}
}

App({
  onLaunch() {
    try {
      const stored = wx.getStorageSync("locale")
      const locale = i18n.normalizeLocale(stored || i18n.getSystemLocale())
      this.globalData.locale = locale
      if (!stored) wx.setStorageSync("locale", locale)
    } catch (e) {
      this.globalData.locale = i18n.getSystemLocale()
    }

    const defaultApiBase = "https://f1ink.normal-person.icu"
    this.globalData.apiBase = defaultApiBase.replace(/\/+$/, "")

    try {
      const v = wx.getStorageSync("k0a")
      if (typeof this.globalData.tweakA !== "boolean" && typeof v === "boolean") {
        this.globalData.tweakA = v
      }
    } catch (e) {}

    try {
      const accountInfo = wx.getAccountInfoSync()
      const envVersion =
        (accountInfo &&
          accountInfo.miniProgram &&
          typeof accountInfo.miniProgram.envVersion === "string" &&
          accountInfo.miniProgram.envVersion) ||
        ""
      this.globalData.envVersion = envVersion

      if (envVersion !== "develop") {
        this.globalData.tweakAEffective = false
      } else {
        const manual = this.globalData.tweakA
        if (typeof manual === "boolean") {
          this.globalData.tweakAEffective = manual
        } else {
          this.globalData.tweakAEffective = true
        }
      }
    } catch (e) {
      this.globalData.tweakAEffective = false
    }

    try {
      const base64 = require("./assets/fonts/formula1_base64.js")
      const source = `url("data:font/ttf;base64,${base64}")`
      wx.loadFontFace({
        family: "Formula1",
        source,
        success: () => {
          this.globalData.formula1Loaded = true
        },
        fail: () => {
          this.globalData.formula1Loaded = false
        }
      })
    } catch (e) {
      this.globalData.formula1Loaded = false
    }

    setupTabsHostSwitchRedirect(this)

    Promise.resolve(fetchWeChatGroupConfig({ silent: true })).catch(() => {})
  },
  onShow() {
    try {
      if (!this.globalData.tweakAEffective) return
      const pages = getCurrentPages()
      const cur = pages && pages[pages.length - 1]
      if (!cur) return
      if (cur.route === "pages/tabs-host/index") return
      if (cur.route !== "pages/news/index") return
      wx.reLaunch({ url: "/pages/tabs-host/index?tab=archive&src=app_onshow_tweaka", fail() {} })
    } catch (e) {}
  },
  globalData: {
    apiBase: "",
    formula1Loaded: false,
    newsDataSource: "backend",
    shopMiniProgram: Object.assign({}, DEFAULT_WECHAT_STORE_CONFIG),
    wechatGroup: Object.assign({}, DEFAULT_WECHAT_GROUP_CONFIG),
    envVersion: "",
    tweakA: null,
    tweakAEffective: false
  }
})
