App({
  onLaunch() {
    const defaultApiBase = "https://winpc-f1.normal-person.icu"
    this.globalData.apiBase = defaultApiBase.replace(/\/+$/, "")

    try {
      const accountInfo = wx.getAccountInfoSync()
      const envVersion =
        (accountInfo &&
          accountInfo.miniProgram &&
          typeof accountInfo.miniProgram.envVersion === "string" &&
          accountInfo.miniProgram.envVersion) ||
        ""
      this.globalData.envVersion = envVersion

      const manual = this.globalData.tweakA
      if (typeof manual === "boolean") {
        this.globalData.tweakAEffective = manual
      } else {
        this.globalData.tweakAEffective = envVersion === "develop"
      }
    } catch (e) {
      const manual = this.globalData.tweakA
      this.globalData.tweakAEffective = typeof manual === "boolean" ? manual : false
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
    envVersion: "",
    tweakA: null,
    tweakAEffective: false
  }
})
