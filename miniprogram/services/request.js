const TOKEN_KEY = "auth_token"

function redact(v) {
  if (!v) return v
  if (typeof v !== "object") return v
  if (Array.isArray(v)) return v.map(redact)
  const out = {}
  Object.keys(v).forEach((k) => {
    const val = v[k]
    if (k === "token" && typeof val === "string") {
      out[k] = `<redacted len=${val.length}>`
      return
    }
    out[k] = redact(val)
  })
  return out
}

function getApiBase() {
  const app = getApp && getApp()
  const base = app && app.globalData && app.globalData.apiBase ? String(app.globalData.apiBase) : ""
  return base.replace(/\/+$/, "")
}

function requestJson(path, options = {}) {
  const method = (options.method || "GET").toUpperCase()
  const data = options.data || undefined
  const needAuth = options.needAuth !== false

  const base = getApiBase()
  if (!base) return Promise.reject(new Error("api base not set"))

  const url = base + (String(path).startsWith("/") ? String(path) : `/${path}`)

  const header = Object.assign(
    { "Content-Type": "application/json" },
    options.header || {}
  )

  if (needAuth) {
    const token = wx.getStorageSync(TOKEN_KEY) || ""
    if (token) header["Authorization"] = `Bearer ${token}`
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header,
      timeout: options.timeout || 15000,
      success: (res) => {
        const status = res && res.statusCode
        const body = res && res.data ? res.data : null
        if (status < 200 || status >= 300) {
          try {
            console.log("[api] http error", { method, path, status, body: redact(body) })
          } catch (e) {}
          reject(new Error(`http_${status}`))
          return
        }
        if (body && body.ok === false) {
          try {
            console.log("[api] biz error", { method, path, status, body: redact(body) })
          } catch (e) {}
          reject(new Error(body.error || "api_error"))
          return
        }
        try {
          console.log("[api] ok", { method, path, status, body: redact(body) })
        } catch (e) {}
        resolve(body)
      },
      fail: (err) => {
        try {
          console.log("[api] fail", { method, path, err })
        } catch (e) {}
        reject(err)
      }
    })
  })
}

module.exports = { requestJson, getApiBase }
