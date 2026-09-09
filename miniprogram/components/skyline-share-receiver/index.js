function buildWrapStyle(p) {
  const parts = []
  if (p.width) parts.push(`width:${p.width};`)
  if (p.height) parts.push(`height:${p.height};`)
  if (p.wrapStyle) parts.push(String(p.wrapStyle))
  return parts.join("")
}

function buildContentStyle(p) {
  return String(p.contentStyle || "")
}

Component({
  options: {
    multipleSlots: true
  },
  properties: {
    shareKey: { type: String, value: "" },
    src: { type: String, value: "" },
    imageMode: { type: String, value: "aspectFit" },
    fallbackText: { type: String, value: "✦" },
    useSlot: { type: Boolean, value: false },
    width: { type: String, value: "" },
    height: { type: String, value: "" },
    wrapStyle: { type: String, value: "" },
    contentStyle: { type: String, value: "" },
    transitionOnGesture: { type: Boolean, value: true },
    rectTweenType: { type: String, value: "materialRectArc" },
    shuttleOnPush: { type: String, value: "to" },
    shuttleOnPop: { type: String, value: "to" }
  },
  data: {
    _wrapStyle: "",
    _contentStyle: "",
    _hasShareKey: false
  },
  lifetimes: {
    attached() {
      this._recompute()
    }
  },
  observers: {
    "width, height, wrapStyle, contentStyle, shareKey": function () {
      this._recompute()
    }
  },
  methods: {
    _recompute() {
      const p = this.properties
      this.setData({
        _wrapStyle: buildWrapStyle(p),
        _contentStyle: buildContentStyle(p),
        _hasShareKey: Boolean(String(p.shareKey || "").trim())
      })
    },
    _onFrame(e) {
      this.triggerEvent("frame", e && e.detail ? e.detail : {}, {})
    },
    _onImgLoad(e) {
      this.triggerEvent("imageload", e && e.detail ? e.detail : {}, {})
    },
    _onImgError(e) {
      this.triggerEvent("imageerror", e && e.detail ? e.detail : {}, {})
    }
  }
})
