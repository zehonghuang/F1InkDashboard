function getApiBase() {
  const app = getApp()
  const apiBase = (app && app.globalData && app.globalData.apiBase) || ""
  return String(apiBase || "").replace(/\/+$/, "")
}

function joinUrl(base, path) {
  const p = String(path || "")
  if (!p) return ""
  if (/^https?:\/\//i.test(p)) return p
  const b = String(base || "").replace(/\/+$/, "")
  if (!b) return p
  if (p.startsWith("/")) return `${b}${p}`
  return `${b}/${p}`
}

function fixRichTextNodes(nodes, baseUrl) {
  const arr = Array.isArray(nodes) ? nodes : []
  return arr.map((n) => {
    if (!n || typeof n !== "object") return n
    const out = Array.isArray(n) ? [...n] : { ...n }
    if (out.attrs && typeof out.attrs === "object" && out.attrs.src) {
      out.attrs = { ...out.attrs, src: joinUrl(baseUrl, out.attrs.src) }
    }
    if (out.children) {
      out.children = fixRichTextNodes(out.children, baseUrl)
    }
    return out
  })
}

function mapNewsItem(item, baseUrl) {
  const it = item || {}
  return {
    id: it.id || "",
    layoutCode: it.layout_code || "",
    heroDisplayCode: it.hero_display_code || "",
    typeCode: it.type_code || "",
    pinned: Boolean(it.pinned),
    weight: Number(it.weight) || 0,
    tagText: it.tag_text || "",
    tags: Array.isArray(it.tags) ? it.tags : [],
    title: it.title || "",
    summary: it.summary || "",
    coverUrl: joinUrl(baseUrl, it.cover_url || ""),
    publishedAt: it.published_at || "",
    timeText: it.time_text || "",
    source: it.source
      ? {
          name: it.source.name || "",
          url: it.source.url || ""
        }
      : null,
    content: it.content
      ? {
          formatCode: it.content.format_code || "PLAIN",
          text: it.content.text || "",
          nodes: fixRichTextNodes(it.content.nodes || [], baseUrl)
        }
      : null
  }
}

function requestJson({ url, method }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: method || "GET",
      success: (res) => {
        const status = Number(res && res.statusCode)
        if (status < 200 || status >= 300) {
          reject(new Error(`http_${status || 0}`))
          return
        }
        resolve((res && res.data) || {})
      },
      fail: reject
    })
  })
}

async function fetchNewsList({ page, pageSize, tz }) {
  const apiBase = getApiBase()
  if (!apiBase) throw new Error("missing_api_base")
  const p = Number(page) > 0 ? Number(page) : 1
  const ps = Number(pageSize) > 0 ? Number(pageSize) : 20
  const tzName = tz || "Asia/Shanghai"
  const url = `${apiBase}/api/v1/mp/news?page=${p}&page_size=${ps}&tz=${encodeURIComponent(tzName)}`
  const data = await requestJson({ url, method: "GET" })
  if (!data || data.ok !== true) throw new Error((data && data.error) || "bad_response")
  const baseUrl = data.base_url ? joinUrl(apiBase, data.base_url) : apiBase
  const items = Array.isArray(data.items) ? data.items : []
  return {
    page: Number(data.page) || p,
    pageSize: Number(data.page_size) || ps,
    total: Number(data.total) || 0,
    items: items.map((it) => mapNewsItem(it, baseUrl))
  }
}

async function fetchNewsDetail({ id, tz }) {
  const apiBase = getApiBase()
  if (!apiBase) throw new Error("missing_api_base")
  const nid = String(id || "").trim()
  if (!nid) throw new Error("missing_id")
  const tzName = tz || "Asia/Shanghai"
  const url = `${apiBase}/api/v1/mp/news/${encodeURIComponent(nid)}?tz=${encodeURIComponent(tzName)}`
  const data = await requestJson({ url, method: "GET" })
  if (!data || data.ok !== true) throw new Error((data && data.error) || "bad_response")
  const baseUrl = data.base_url ? joinUrl(apiBase, data.base_url) : apiBase
  return mapNewsItem(data.item || null, baseUrl)
}

module.exports = {
  fetchNewsList,
  fetchNewsDetail
}
