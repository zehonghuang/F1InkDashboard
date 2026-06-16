const i18n = require("../../services/i18n")
const WeCropper = require("../../vendors/we-cropper/we-cropper")

const DEFAULT_TARGET_WIDTH = 351
const DEFAULT_TARGET_HEIGHT = 242

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
        this.setData({ ready: true })
      })
      .on("beforeImageLoad", () => {
        wx.showLoading({ title: i18n.t("common.loading"), mask: true })
      })
      .on("imageLoad", () => {
        wx.hideLoading()
      })
    this.cropper.pushOrign(this.data.filePath)
  },
  touchStart(e) {
    if (this.cropper) this.cropper.touchStart(e)
  },
  touchMove(e) {
    if (this.cropper) this.cropper.touchMove(e)
  },
  touchEnd(e) {
    if (this.cropper) this.cropper.touchEnd(e)
  },
  onReset() {
    if (!this.cropper) return
    this.cropper.pushOrign(this.data.filePath)
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
