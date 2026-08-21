const { requestJson } = require("./request")

const DEFAULT_WECHAT_GROUP_CONFIG = {
  name: "",
  hint: "",
  qrImage: ""
}

const STORAGE_KEY = "wechat_group_config"
const STORAGE_TS_KEY = "wechat_group_config_ts"
const TTL_MS = 10 * 60 * 1000

function getApiBase() {
  try {
    const app = getApp()
    if (app && app.globalData && typeof app.globalData.apiBase === "string") {
      return String(app.globalData.apiBase).replace(/\/+$/, "")
    }
  } catch (e) {}
  try {
    const { getApiBase: g } = require("./request")
    if (typeof g === "function") return String(g() || "").replace(/\/+$/, "")
  } catch (e) {}
  return ""
}

function resolveQrImageUrl(path) {
  const p = String(path || "").trim()
  if (!p) return ""
  if (/^https?:\/\//i.test(p)) return p
  if (/^\/\//.test(p)) return "https:" + p
  const base = getApiBase()
  if (!base) return p
  if (p.startsWith(base)) return p
  if (p.startsWith("/")) return base + p
  return base + "/" + p
}

function readCached() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    const ts = wx.getStorageSync(STORAGE_TS_KEY)
    if (!raw || typeof raw !== "object") return null
    if (!ts || Date.now() - Number(ts || 0) > TTL_MS) return null
    return raw
  } catch (e) {
    return null
  }
}

function writeCached(cfg) {
  try {
    wx.setStorageSync(STORAGE_KEY, cfg)
    wx.setStorageSync(STORAGE_TS_KEY, Date.now())
  } catch (e) {}
}

function mergeWithDefault(cfg) {
  const base = Object.assign({}, DEFAULT_WECHAT_GROUP_CONFIG)
  const src = (cfg && typeof cfg === "object") ? cfg : {}
  const name = String(src.name || "").trim()
  const hint = String(src.hint || "").trim()
  let qrImageRaw = String(src.qrImage || "").trim()
  if (!qrImageRaw) qrImageRaw = String(src.qr_image || "").trim()
  const qrImage = resolveQrImageUrl(qrImageRaw)
  return {
    name: name || DEFAULT_WECHAT_GROUP_CONFIG.name,
    hint: hint || DEFAULT_WECHAT_GROUP_CONFIG.hint,
    qrImage: qrImage || DEFAULT_WECHAT_GROUP_CONFIG.qrImage
  }
}

function getWeChatGroupConfig() {
  const cached = readCached()
  if (cached) return mergeWithDefault(cached)
  try {
    const app = getApp()
    const cfg = (app && app.globalData && app.globalData.wechatGroup) || {}
    return mergeWithDefault(cfg)
  } catch (e) {
    return Object.assign({}, DEFAULT_WECHAT_GROUP_CONFIG)
  }
}

async function fetchWeChatGroupConfig(opts) {
  const silent = Boolean(opts && opts.silent)
  try {
    const res = await requestJson("/api/v1/mp/wechat-group", { method: "GET", needAuth: false })
    const config = (res && res.config) ? res.config : {}
    const merged = mergeWithDefault(config)
    writeCached(merged)
    try {
      const app = getApp()
      if (app && app.globalData) {
        app.globalData.wechatGroup = Object.assign({}, app.globalData.wechatGroup || {}, merged)
      }
    } catch (e) {}
    return merged
  } catch (e) {
    if (!silent) {
      try {
        console.log("[wechatGroup] fetch failed", e)
      } catch (err) {}
    }
    return null
  }
}

module.exports = {
  DEFAULT_WECHAT_GROUP_CONFIG,
  getWeChatGroupConfig,
  fetchWeChatGroupConfig
}
