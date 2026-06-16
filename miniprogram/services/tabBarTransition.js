const LEAVE_DURATION_MS = 140
const ENTER_DURATION_MS = 220
const TRANSITION_TTL_MS = 1200

function normalizeRoute(route) {
  const v = String(route || "").trim()
  if (!v) return ""
  return v.startsWith("/") ? v : `/${v}`
}

function getAppSafe() {
  try {
    return getApp()
  } catch (e) {
    return null
  }
}

function beginTabBarTransition({ fromRoute, toRoute }) {
  const app = getAppSafe()
  if (!app) return
  app.globalData = app.globalData || {}
  app.globalData.__tabBarTransition = {
    fromRoute: normalizeRoute(fromRoute),
    toRoute: normalizeRoute(toRoute),
    at: Date.now()
  }
}

function consumeTabBarEnterTransition(route) {
  const app = getAppSafe()
  if (!app || !app.globalData) return false
  const state = app.globalData.__tabBarTransition
  if (!state) return false

  const fresh = Date.now() - Number(state.at || 0) <= TRANSITION_TTL_MS
  const matched = fresh && normalizeRoute(state.toRoute) === normalizeRoute(route)

  if (matched) {
    app.globalData.__tabBarTransition = null
  }

  return matched
}

function clearPageTimers(page) {
  if (!page) return
  clearTimeout(page._tabBarEnterTimer)
  page._tabBarEnterTimer = null
}

function applyTabBarLeaveTransition(page) {
  if (!page || typeof page.setData !== "function") return
  clearPageTimers(page)
  page.setData({
    tabSwitchEntering: false,
    tabSwitchLeaving: true
  })
}

function applyTabBarEnterTransition(page) {
  if (!page || typeof page.setData !== "function") return
  const shouldEnter = consumeTabBarEnterTransition(page.route)
  clearPageTimers(page)

  if (!shouldEnter) {
    page.setData({
      tabSwitchEntering: false,
      tabSwitchLeaving: false
    })
    return
  }

  page.setData({
    tabSwitchLeaving: false,
    tabSwitchEntering: true
  })

  page._tabBarEnterTimer = setTimeout(() => {
    if (!page || typeof page.setData !== "function") return
    page.setData({ tabSwitchEntering: false })
  }, ENTER_DURATION_MS)
}

function clearTabBarPageTransition(page) {
  clearPageTimers(page)
}

module.exports = {
  LEAVE_DURATION_MS,
  ENTER_DURATION_MS,
  beginTabBarTransition,
  applyTabBarLeaveTransition,
  applyTabBarEnterTransition,
  clearTabBarPageTransition
}
