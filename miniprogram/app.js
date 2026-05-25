App({
  onLaunch() {
    const defaultApiBase = "https://winpc-f1.normal-person.icu"
    this.globalData.apiBase = defaultApiBase.replace(/\/+$/, "")

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
  globalData: {
    apiBase: "",
    formula1Loaded: false
  }
})
