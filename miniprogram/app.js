const i18n = require("./services/i18n")
const { DEFAULT_WECHAT_STORE_CONFIG } = require("./services/wechatStore")
const { DEFAULT_WECHAT_GROUP_CONFIG, fetchWeChatGroupConfig } = require("./services/wechatGroup")

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

    Promise.resolve(fetchWeChatGroupConfig({ silent: true })).catch(() => {})
  },
  onShow() {
    try {
      if (!this.globalData.tweakAEffective) return
      const pages = getCurrentPages()
      const cur = pages && pages[pages.length - 1]
      if (!cur || cur.route !== "pages/news/index") return
      wx.switchTab({ url: "/pages/archive/index" })
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
