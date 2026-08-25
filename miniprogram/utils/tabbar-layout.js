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

module.exports = { computeTabbarReserveStyle }
