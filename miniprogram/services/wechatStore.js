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

module.exports = {
  DEFAULT_WECHAT_STORE_CONFIG,
  getWeChatStoreConfig
}
