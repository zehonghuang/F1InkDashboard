function computeTabbarReserveStyle(pixelRatioRoundFix) {
  try {
    const sys = wx.getSystemInfoSync()
    const wh = Number(sys && sys.windowHeight) || 0
    const ww = Number(sys && sys.windowWidth) || 0
    const safe = (sys && sys.safeArea) || null
    const safeBottom = safe && Number(safe.bottom)
    if (!wh || !ww || !Number.isFinite(safeBottom) || safeBottom <= 0) {
      return {
        tabbarReserveRpx: 180,
        scrollViewStyle: "height: calc(100vh - 180rpx);"
      }
    }
    const bottomPx = wh - safeBottom
    const rpxPerPx = 750 / ww
    const bottomRpx = Math.ceil(bottomPx * rpxPerPx)
    const tabbarInnerRpx = 104
    const margin = 4
    const total = tabbarInnerRpx + bottomRpx + margin
    const safeTotal = Number.isFinite(total) && total > 120 ? total : 180
    console.log(
      "[LAYOUT] computeTabbarReserve",
      "wh=", wh, "ww=", ww, "safeBottom=", safeBottom,
      "bottomPx=", bottomPx, "bottomRpx=", bottomRpx, "tabbarInnerRpx=", tabbarInnerRpx,
      "safeTotal=", safeTotal
    )
    return {
      tabbarReserveRpx: safeTotal,
      scrollViewStyle: `height: calc(100vh - ${safeTotal}rpx);`
    }
  } catch (e) {
    console.error("[LAYOUT] computeTabbarReserveStyle failed, fallback to 180rpx", e)
    return {
      tabbarReserveRpx: 180,
      scrollViewStyle: "height: calc(100vh - 180rpx);"
    }
  }
}

function computePickerLayout() {
  try {
    const sys = wx.getSystemInfoSync()
    const wh = Number(sys && sys.windowHeight) || 0
    const ww = Number(sys && sys.windowWidth) || 0
    const safe = (sys && sys.safeArea) || null
    const safeTop = safe && Number(safe.top)
    const safeBottom = safe && Number(safe.bottom)
    let topPx = 0
    try {
      const mb = wx.getMenuButtonBoundingClientRect()
      topPx = (mb && Number(mb.bottom)) || 0
    } catch (e) {}
    const statusBarPx = Number(sys && sys.statusBarHeight) || 0
    if (!topPx) topPx = statusBarPx + 32
    topPx += 12
    const bottomGapPx = 12
    let bottomReservePx = 0
    if (wh && Number.isFinite(safeBottom) && safeBottom > 0) {
      bottomReservePx = wh - safeBottom + bottomGapPx
    }
    const tabbarInnerPx = (104 * (ww || 375)) / 750
    bottomReservePx += tabbarInnerPx
    if (bottomReservePx < 80) bottomReservePx = 80
    if (!Number.isFinite(safeTop) || safeTop <= 0) topPx = Math.max(topPx, statusBarPx + 44)
    console.log(
      "[LAYOUT] computePickerLayout",
      "statusBarPx=", statusBarPx,
      "topPx=", topPx,
      "bottomReservePx=", bottomReservePx,
      "wh=", wh, "ww=", ww,
      "safeTop=", safeTop, "safeBottom=", safeBottom
    )
    return {
      pickerTopPx: Math.round(topPx),
      pickerBottomPx: Math.round(bottomReservePx),
      pickerInnerStyle: `top:${Math.round(topPx)}px;bottom:${Math.round(bottomReservePx)}px;left:12px;right:12px;`
    }
  } catch (e) {
    console.error("[LAYOUT] computePickerLayout failed, fallback", e)
    return {
      pickerTopPx: 64,
      pickerBottomPx: 96,
      pickerInnerStyle: "top:64px;bottom:96px;left:12px;right:12px;"
    }
  }
}

module.exports = { computeTabbarReserveStyle, computePickerLayout }
