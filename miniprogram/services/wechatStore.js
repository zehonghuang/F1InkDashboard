const i18n = require("./i18n")

const DEFAULT_WECHAT_STORE_CONFIG = {
  appId: "wx09ead34ea6955f43",
  path: "",
  envVersion: "release"
}

function normalizeEnvVersion(envVersion) {
  const value = String(envVersion || DEFAULT_WECHAT_STORE_CONFIG.envVersion).trim()
  return /^(develop|trial|release)$/.test(value) ? value : DEFAULT_WECHAT_STORE_CONFIG.envVersion
}

function getWeChatStoreConfig() {
  try {
    const app = getApp()
    const cfg = (app && app.globalData && app.globalData.shopMiniProgram) || {}
    return {
      appId: String(cfg.appId || DEFAULT_WECHAT_STORE_CONFIG.appId).trim(),
      path: String(cfg.path || DEFAULT_WECHAT_STORE_CONFIG.path).trim(),
      envVersion: normalizeEnvVersion(cfg.envVersion)
    }
  } catch (e) {
    return Object.assign({}, DEFAULT_WECHAT_STORE_CONFIG)
  }
}

function openWeChatStore() {
  if (typeof wx.navigateToMiniProgram !== "function") {
    wx.showToast({ title: i18n.t("mine.shopOpenFailed"), icon: "none" })
    return false
  }
  const cfg = getWeChatStoreConfig()
  if (!cfg.appId) {
    wx.showToast({ title: i18n.t("mine.shopConfigMissing"), icon: "none" })
    return false
  }
  const payload = {
    appId: cfg.appId,
    envVersion: cfg.envVersion,
    success: () => {},
    fail: (err) => {
      const msg = String((err && err.errMsg) || "")
      if (/cancel/i.test(msg)) return
      try {
        console.log("[wechat-store] open failed", err)
      } catch (e) {}
      wx.showToast({ title: i18n.t("mine.shopOpenFailed"), icon: "none" })
    }
  }
  if (cfg.path) payload.path = cfg.path
  wx.navigateToMiniProgram(payload)
  return true
}

module.exports = {
  DEFAULT_WECHAT_STORE_CONFIG,
  getWeChatStoreConfig,
  openWeChatStore
}
