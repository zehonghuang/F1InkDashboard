const TOKEN_KEY = "auth_token"
const PROFILE_KEY = "auth_profile"

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

function getAuthState() {
  const token = getToken()
  const profile = getProfile()
  return {
    isLoggedIn: Boolean(token),
    token,
    profile
  }
}

function logout() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(PROFILE_KEY)
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
  const token = `local_${Date.now()}_${code}`
  setToken(token)
  return { token }
}

async function fetchUserProfile() {
  const profile = await new Promise((resolve, reject) => {
    if (typeof wx.getUserProfile !== "function") {
      reject(new Error("getUserProfile not supported"))
      return
    }
    wx.getUserProfile({
      desc: "用于展示头像昵称与同步偏好设置",
      success: (res) => {
        const u = res && res.userInfo
        resolve(u || null)
      },
      fail: reject
    })
  })
  if (profile) setProfile(profile)
  return profile
}

module.exports = {
  getAuthState,
  loginWithWeChat,
  fetchUserProfile,
  logout,
  setProfile
}

