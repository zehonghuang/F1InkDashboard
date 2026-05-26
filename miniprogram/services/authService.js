const TOKEN_KEY = "auth_token"
const PROFILE_KEY = "auth_profile"
const DEVICE_ID_KEY = "device_id"

const { requestJson, getApiBase } = require("./request")

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ""
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token || "")
}

function getProfile() {
  return wx.getStorageSync(PROFILE_KEY) || null
}

function setProfile(profile) {
  if (!profile) {
    wx.removeStorageSync(PROFILE_KEY)
    return
  }
  wx.setStorageSync(PROFILE_KEY, profile)
}

function patchProfile(patch) {
  if (!patch || typeof patch !== "object") return
  const prev = getProfile() || {}
  const next = Object.assign({}, prev, patch)
  setProfile(next)
}

function getDeviceId() {
  return wx.getStorageSync(DEVICE_ID_KEY) || ""
}

function setDeviceId(deviceId) {
  const v = (deviceId || "").trim()
  if (!v) {
    wx.removeStorageSync(DEVICE_ID_KEY)
    return
  }
  wx.setStorageSync(DEVICE_ID_KEY, v)
}

function getAuthState() {
  const token = getToken()
  const profile = getProfile()
  const deviceId = getDeviceId()
  return {
    isLoggedIn: Boolean(token),
    token,
    profile,
    deviceId
  }
}

function logoutLocal() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(PROFILE_KEY)
  wx.removeStorageSync(DEVICE_ID_KEY)
}

function normalizeRemoteURL(url) {
  const v = String(url || "").trim()
  if (!v) return ""
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith("wxfile://")) return v
  const base = getApiBase()
  if (!base) return v
  if (v.startsWith("/")) return base + v
  return base + "/" + v
}

async function loginWithWeChat() {
  const code = await new Promise((resolve, reject) => {
    wx.login({
      timeout: 8000,
      success: (res) => {
        if (res && res.code) resolve(res.code)
        else reject(new Error("no code"))
      },
      fail: reject
    })
  })

  try {
    console.log("[auth] wx.login ok", { codeLen: String(code || "").length })
  } catch (e) {}

  const r = await requestJson("/api/v1/mp/auth/login", {
    method: "POST",
    data: { code },
    needAuth: false
  })
  if (!r || !r.token) throw new Error("bad_login_response")
  setToken(r.token)
  try {
    console.log("[auth] backend login ok", {
      expiresAt: r.expiresAt,
      user: r.user || null,
      tokenLen: String(r.token || "").length
    })
  } catch (e) {}
  return { token: r.token }
}

async function updateNickName(nickName) {
  const v = String(nickName || "").trim()
  if (!v) throw new Error("nick_name_required")
  patchProfile({ nickName: v })
  const s = getAuthState()
  if (!s || !s.token) return
  const r = await requestJson("/api/v1/mp/auth/profile", {
    method: "POST",
    data: { nick_name: v },
    needAuth: true
  })
  try {
    console.log("[auth] nick sync ok", r || null)
  } catch (e) {}
  return r
}

async function uploadAvatar(tempFilePath) {
  const fp = String(tempFilePath || "").trim()
  if (!fp) throw new Error("avatar_file_required")
  patchProfile({ avatarUrl: fp })

  const base = getApiBase()
  if (!base) throw new Error("api base not set")
  const token = getToken()
  if (!token) throw new Error("unauthorized")

  const url = base.replace(/\/+$/, "") + "/api/v1/mp/auth/avatar"
  const res = await new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath: fp,
      name: "avatar",
      header: { Authorization: `Bearer ${token}` },
      timeout: 30000,
      success: resolve,
      fail: reject
    })
  })

  const status = res && res.statusCode
  let body = null
  try {
    body = typeof res.data === "string" ? JSON.parse(res.data) : res.data
  } catch (e) {}

  if (status < 200 || status >= 300) {
    try {
      console.log("[auth] avatar upload http error", { status, body })
    } catch (e) {}
    throw new Error(`http_${status}`)
  }
  if (body && body.ok === false) {
    throw new Error(body.error || "avatar_upload_failed")
  }

  const avatarURL = normalizeRemoteURL(body && body.avatar_url)
  if (avatarURL) patchProfile({ avatarUrl: avatarURL })
  try {
    console.log("[auth] avatar upload ok", { avatarUrl: avatarURL, bytes: body && body.bytes, mime: body && body.mime })
  } catch (e) {}
  return body
}

async function fetchMe() {
  const r = await requestJson("/api/v1/mp/auth/me", { method: "GET", needAuth: true })
  try {
    if (r && r.user) {
      const patch = {}
      if (r.user.nick_name) patch.nickName = String(r.user.nick_name || "").trim()
      if (r.user.avatar_url) patch.avatarUrl = normalizeRemoteURL(r.user.avatar_url)
      patchProfile(patch)
    }
    if (r && r.device_id) setDeviceId(String(r.device_id || "").trim())
  } catch (e) {}
  try {
    console.log("[auth] me ok", r || null)
  } catch (e) {}
  return r
}

async function bindDevice(deviceId) {
  const v = (deviceId || "").trim()
  if (!v) throw new Error("device_id_required")
  const r = await requestJson("/api/v1/mp/auth/bind_device", {
    method: "POST",
    data: { device_id: v },
    needAuth: true
  })
  setDeviceId(v)
  try {
    console.log("[auth] bind device ok", r || null)
  } catch (e) {}
  return r
}

async function logout() {
  try {
    await requestJson("/api/v1/mp/auth/logout", { method: "POST", needAuth: true })
  } catch (e) {}
  logoutLocal()
}

module.exports = {
  getAuthState,
  loginWithWeChat,
  updateNickName,
  uploadAvatar,
  fetchMe,
  bindDevice,
  logout,
  setProfile,
  patchProfile,
  setDeviceId,
  getDeviceId
}

