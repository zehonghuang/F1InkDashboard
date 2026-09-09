const i18n = require("../../../../services/i18n")
const { getWeChatGroupConfig, fetchWeChatGroupConfig } = require("../../../../services/wechatGroup")

const FAKE_QR_MATRIX = [
  "11111110001011111",
  "10000010111010001",
  "10111010001010111",
  "10111010111010101",
  "10111010010010101",
  "10000010101110001",
  "11111110101011111",
  "00000000110100000",
  "11101110101101110",
  "00111000010101001",
  "11001110111010011",
  "01110100001011100",
  "10101110101010010",
  "00000000111100000",
  "11111110010101110",
  "10000010111100101",
  "10111010010011101",
  "10111010101100011",
  "10111010011010101",
  "10000010100011100",
  "11111110111010110"
]

function buildFakeQrCells(matrix) {
  const out = []
  const rows = Array.isArray(matrix) ? matrix : []
  const offset = 48
  const gap = 24
  for (let row = 0; row < rows.length; row += 1) {
    const line = String(rows[row] || "")
    for (let col = 0; col < line.length; col += 1) {
      if (line.charAt(col) !== "1") continue
      out.push({
        key: `${row}-${col}`,
        left: offset + col * gap,
        top: offset + row * gap
      })
    }
  }
  return out
}

Page({
  data: {
    i18n: i18n.getDict(),
    statusBarHeight: 0,
    wechatGroupName: "",
    wechatGroupHint: "",
    wechatGroupQrUrl: "",
    wechatGroupQrLoaded: false,
    wechatGroupQrBroken: false,
    fakeQrCells: buildFakeQrCells(FAKE_QR_MATRIX)
  },
  onLoad() {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.applyI18n()
    this.syncConfig()
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  applyI18n() {
    this.setData({ i18n: i18n.getDict() })
    this.syncConfig()
  },
  syncConfig() {
    const cfg = getWeChatGroupConfig()
    const dict = i18n.getDict()
    const name = String(cfg.name || dict.mine.wechatGroupTitle).trim()
    const hint = String(cfg.hint || dict.mine.wechatGroupHint).trim()
    const qrUrl = String(cfg.qrImage || "").trim()
    this.setData({
      wechatGroupName: name,
      wechatGroupHint: hint,
      wechatGroupQrUrl: qrUrl,
      wechatGroupQrLoaded: false,
      wechatGroupQrBroken: !qrUrl
    })
  },
  async refreshFromBackend(opts) {
    try {
      const cfg = await fetchWeChatGroupConfig(opts || {})
      if (cfg) {
        this.syncConfig()
      }
    } catch (e) {}
  },
  onBack() {
    wx.navigateBack({ delta: 1, fail: () => {} })
  },
  onQrLoad() {
    this.setData({
      wechatGroupQrLoaded: true,
      wechatGroupQrBroken: false
    })
  },
  onQrError() {
    this.setData({
      wechatGroupQrLoaded: false,
      wechatGroupQrBroken: true
    })
  },
  onPreviewQr() {
    const url = String(this.data.wechatGroupQrUrl || "").trim()
    if (!url || !this.data.wechatGroupQrLoaded || this.data.wechatGroupQrBroken) {
      wx.showToast({ title: i18n.t("mine.wechatGroupFakePreview"), icon: "none" })
      return
    }
    wx.previewImage({
      current: url,
      urls: [url]
    })
  }
})
