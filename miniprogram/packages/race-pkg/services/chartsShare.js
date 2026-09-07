function getApiBase() {
  const app = getApp && getApp()
  const base = app && app.globalData && app.globalData.apiBase ? String(app.globalData.apiBase) : ""
  return base.replace(/\/+$/, "")
}

function base64UrlEncodeFromBytes(u8) {
  const b64 = wx.arrayBufferToBase64(u8.buffer)
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function utf8ToUint8Array(str) {
  const s = unescape(encodeURIComponent(String(str)))
  const u8 = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i)
  return u8
}

function encodeShareHash(payload) {
  const json = JSON.stringify(Object.assign({ v: 1 }, payload || {}))
  const bytes = utf8ToUint8Array(json)
  return base64UrlEncodeFromBytes(bytes)
}

function buildChartsShareUrl(payload) {
  const base = getApiBase()
  if (!base) throw new Error("api_base_not_set")
  const hash = encodeShareHash(payload)
  return `${base}/charts/#${hash}`
}

module.exports = { buildChartsShareUrl, encodeShareHash }
