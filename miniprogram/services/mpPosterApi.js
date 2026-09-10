const { requestJson } = require("./request")

const STORAGE_KEY = "mp_poster_cache"
const STORAGE_TS_KEY = "mp_poster_cache_ts"
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

function resolveUrl(path) {
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

function normalizePoster(raw) {
  if (!raw || typeof raw !== "object") return null
  const id = Number(raw.id) || 0
  if (!id) return null
  const posterRatio = Number(raw.poster_ratio) || 0
  const posterWidth = Number(raw.poster_width) || 0
  const posterHeight = Number(raw.poster_height) || 0
  let contentNodes = raw.content_nodes
  if (typeof contentNodes === "string") {
    try {
      contentNodes = JSON.parse(contentNodes)
    } catch (e) {
      contentNodes = null
    }
  }
  if (!Array.isArray(contentNodes)) contentNodes = []
  return {
    id,
    title: String(raw.title || "").trim(),
    posterUrl: resolveUrl(raw.poster_url),
    posterWidth,
    posterHeight,
    posterRatio: posterRatio > 0 ? posterRatio : (posterWidth > 0 && posterHeight > 0 ? posterWidth / posterHeight : 0),
    status: String(raw.status || "").trim(),
    weight: Number(raw.weight) || 0,
    contentFormat: String(raw.content_format || "RICH_TEXT_NODES").trim(),
    contentText: String(raw.content_text || "").trim(),
    contentNodes,
    publishedAt: String(raw.published_at || "").trim(),
    createdAt: String(raw.created_at || "").trim(),
    updatedAt: String(raw.updated_at || "").trim()
  }
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

function writeCached(data) {
  try {
    wx.setStorageSync(STORAGE_KEY, data)
    wx.setStorageSync(STORAGE_TS_KEY, Date.now())
  } catch (e) {}
}

function getPosterCache() {
  const cached = readCached()
  if (cached && cached.item) return cached
  try {
    const app = getApp()
    const g = app && app.globalData && app.globalData.poster
    if (g && g.item) return g
  } catch (e) {}
  return null
}

async function fetchPoster(opts) {
  const silent = Boolean(opts && opts.silent)
  try {
    const res = await requestJson("/api/v1/mp/poster", { method: "GET", needAuth: false })
    const base = String((res && res.base_url) || "").trim()
    if (base) {
      try {
        const app = getApp()
        if (app && app.globalData) app.globalData.posterBaseUrl = base
      } catch (e) {}
    }
    const raw = (res && res.item) || null
    const item = normalizePoster(raw)
    const out = { baseUrl: base || getApiBase(), item }
    writeCached(out)
    try {
      const app = getApp()
      if (app && app.globalData) app.globalData.poster = Object.assign({}, app.globalData.poster || {}, out)
    } catch (e) {}
    return out
  } catch (e) {
    if (!silent) {
      try { console.log("[mpPoster] fetch failed", e) } catch (err) {}
    }
    return null
  }
}

module.exports = {
  getPosterCache,
  fetchPoster
}
