const i18n = require("../../services/i18n")
const WeCropper = require("../../vendors/we-cropper/we-cropper")

const DEFAULT_TARGET_WIDTH = 351
const DEFAULT_TARGET_HEIGHT = 242
const ZOOM_MIN = 100
const ZOOM_MAX = 300

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num))
}

Page({
  data: {
    i18n: i18n.getDict(),
    filePath: "",
    ready: false,
    processing: false,
    cropWidth: DEFAULT_TARGET_WIDTH,
    cropHeight: DEFAULT_TARGET_HEIGHT,
    previewCardTop: 0,
    previewCardLeft: 0,
    previewCardWidth: 0,
    previewCardHeight: 0,
    zoomValue: ZOOM_MIN,
    cropperOpt: null
  },
  onLoad(query) {
    const filePath = query && query.file ? decodeURIComponent(query.file) : ""
    const targetWidth = Math.max(1, Math.round(Number(query && query.targetWidth) || DEFAULT_TARGET_WIDTH))
    const targetHeight = Math.max(1, Math.round(Number(query && query.targetHeight) || DEFAULT_TARGET_HEIGHT))
    this._scene = query && query.scene ? String(query.scene) : ""
    this._eventChannel = this.getOpenerEventChannel ? this.getOpenerEventChannel() : null
    wx.setNavigationBarTitle({ title: i18n.t("mine.coverCropTitle") })
    if (!filePath) {
      wx.showToast({ title: i18n.t("mine.coverUploadFailed"), icon: "none" })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 300)
      return
    }
    const sys = wx.getSystemInfoSync()
    const cropWidth = Math.max(240, targetWidth)
    const cropHeight = Math.max(120, targetHeight)
    const pixelRatio = Number(sys && sys.pixelRatio) || 2
    const cropperOpt = {
      id: "cropper",
      targetId: "targetCropper",
      pixelRatio,
      width: cropWidth,
      height: cropHeight,
      scale: 3,
      zoom: 8,
      cut: {
        x: 0,
        y: 0,
        width: cropWidth,
        height: cropHeight
      }
    }
    this.setData(
      {
        i18n: i18n.getDict(),
        filePath,
        cropWidth,
        cropHeight,
        previewCardLeft: Math.round(cropWidth * 0.04),
        previewCardWidth: Math.round(cropWidth * 0.92),
        previewCardHeight: Math.round(cropHeight * 0.3),
        previewCardTop: Math.round(cropHeight - Math.round(cropHeight * 0.3) - cropHeight * 0.07),
        cropperOpt
      },
      () => this.initCropper()
    )
  },
  initCropper() {
    if (this.cropper) return
    const cropperOpt = this.data.cropperOpt
    this.cropper = new WeCropper(cropperOpt)
      .on("ready", () => {
        this.overrideCropperBounds()
        this.setData({ ready: true })
      })
      .on("beforeImageLoad", () => {
        wx.showLoading({ title: i18n.t("common.loading"), mask: true })
      })
      .on("imageLoad", () => {
        wx.hideLoading()
        this.applyContainLayout()
        this.syncZoomValue()
      })
    this.cropper.pushOrign(this.data.filePath)
  },
  overrideCropperBounds() {
    const cropper = this.cropper
    if (!cropper || cropper._customBoundPatched) return
    cropper._customBoundPatched = true
    cropper.outsideBound = (imgLeft, imgTop) => {
      const cut = cropper.cut || {}
      const x = Number(cut.x) || 0
      const y = Number(cut.y) || 0
      const width = Number(cut.width) || Number(cropper.width) || 0
      const height = Number(cut.height) || Number(cropper.height) || 0
      const scaleWidth = Number(cropper.scaleWidth) || 0
      const scaleHeight = Number(cropper.scaleHeight) || 0
      const clampAxis = (pos, start, span, size) => {
        if (!(span > 0) || !(size > 0)) return Number(pos) || 0
        if (size <= span) {
          return clamp(Number(pos) || 0, start, start + span - size)
        }
        return clamp(Number(pos) || 0, start + span - size, start)
      }
      cropper.imgLeft = clampAxis(imgLeft, x, width, scaleWidth)
      cropper.imgTop = clampAxis(imgTop, y, height, scaleHeight)
    }
  },
  applyContainLayout() {
    const cropper = this.cropper
    if (!cropper) return
    const cut = cropper.cut || {}
    const cutWidth = Number(cut.width) || this.data.cropWidth || DEFAULT_TARGET_WIDTH
    const cutHeight = Number(cut.height) || this.data.cropHeight || DEFAULT_TARGET_HEIGHT
    const coverBaseWidth = Number(cropper.baseWidth) || 0
    const coverBaseHeight = Number(cropper.baseHeight) || 0
    if (!(coverBaseWidth > 0) || !(coverBaseHeight > 0) || !(cutWidth > 0) || !(cutHeight > 0)) return
    const containRatio = Math.min(cutWidth / coverBaseWidth, cutHeight / coverBaseHeight, 1)
    const nextBaseWidth = Math.round(coverBaseWidth * containRatio)
    const nextBaseHeight = Math.round(coverBaseHeight * containRatio)
    const cutX = Number(cut.x) || 0
    const cutY = Number(cut.y) || 0
    const rectX = Math.round(cutX + (cutWidth - nextBaseWidth) / 2)
    const rectY = Math.round(cutY + (cutHeight - nextBaseHeight) / 2)
    cropper.baseWidth = nextBaseWidth
    cropper.baseHeight = nextBaseHeight
    cropper.scaleWidth = nextBaseWidth
    cropper.scaleHeight = nextBaseHeight
    cropper.rectX = rectX
    cropper.rectY = rectY
    cropper.imgLeft = rectX
    cropper.imgTop = rectY
    cropper.oldScale = 1
    cropper.newScale = 1
    cropper.updateCanvas()
  },
  scaleToZoomValue(value) {
    const cropper = this.cropper
    const maxScale = Number(cropper && cropper.scale) || 3
    const percent = clamp(Number(value) || ZOOM_MIN, ZOOM_MIN, ZOOM_MAX)
    if (maxScale <= 1) return 1
    return 1 + ((percent - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * (maxScale - 1)
  },
  zoomValueFromScale(scaleValue) {
    const cropper = this.cropper
    const maxScale = Number(cropper && cropper.scale) || 3
    const scale = clamp(Number(scaleValue) || 1, 1, maxScale)
    if (maxScale <= 1) return ZOOM_MIN
    const percent = ZOOM_MIN + ((scale - 1) / (maxScale - 1)) * (ZOOM_MAX - ZOOM_MIN)
    return Math.round(clamp(percent, ZOOM_MIN, ZOOM_MAX))
  },
  syncZoomValue() {
    if (!this.cropper) return
    const scaleValue = Number(this.cropper.oldScale || this.cropper.newScale || 1)
    const zoomValue = this.zoomValueFromScale(scaleValue)
    if (zoomValue !== this.data.zoomValue) {
      this.setData({ zoomValue })
    }
  },
  applyZoomValue(value) {
    if (!this.cropper || !this.cropper.src) return
    const cropper = this.cropper
    const nextScale = this.scaleToZoomValue(value)
    const centerX = Math.round(Number(cropper.rectX || 0) + Number(cropper.scaleWidth || cropper.baseWidth || 0) / 2)
    const centerY = Math.round(Number(cropper.rectY || 0) + Number(cropper.scaleHeight || cropper.baseHeight || 0) / 2)
    cropper.newScale = nextScale
    cropper.oldScale = nextScale
    cropper.scaleWidth = Math.round(nextScale * Number(cropper.baseWidth || 0))
    cropper.scaleHeight = Math.round(nextScale * Number(cropper.baseHeight || 0))
    const imgLeft = Math.round(centerX - cropper.scaleWidth / 2)
    const imgTop = Math.round(centerY - cropper.scaleHeight / 2)
    cropper.outsideBound(imgLeft, imgTop)
    cropper.rectX = cropper.imgLeft
    cropper.rectY = cropper.imgTop
    cropper.updateCanvas()
  },
  touchStart(e) {
    if (this.cropper) this.cropper.touchStart(e)
  },
  touchMove(e) {
    if (this.cropper) this.cropper.touchMove(e)
  },
  touchEnd(e) {
    if (this.cropper) {
      this.cropper.touchEnd(e)
      this.syncZoomValue()
    }
  },
  onZoomChanging(e) {
    const zoomValue = clamp(Number(e && e.detail && e.detail.value) || ZOOM_MIN, ZOOM_MIN, ZOOM_MAX)
    this.setData({ zoomValue })
    this.applyZoomValue(zoomValue)
  },
  onReset() {
    if (!this.cropper) return
    this.cropper.pushOrign(this.data.filePath)
    this.setData({ zoomValue: ZOOM_MIN })
  },
  onCancel() {
    wx.navigateBack({ delta: 1 })
  },
  onConfirm() {
    if (!this.cropper || this.data.processing) return
    this.setData({ processing: true })
    this.cropper.getCropperImage((tempFilePath, err) => {
      if (!tempFilePath || err) {
        wx.showToast({ title: i18n.t("mine.coverUploadFailed"), icon: "none" })
        this.setData({ processing: false })
        return
      }
      if (this._eventChannel) {
        this._eventChannel.emit("done", { filePath: tempFilePath, scene: this._scene })
      }
      wx.navigateBack({ delta: 1 })
    })
  },
  onUnload() {
    try {
      wx.hideLoading()
    } catch (e) {}
    this.cropper = null
  }
})
