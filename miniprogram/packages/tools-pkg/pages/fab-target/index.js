Page({
  data: {
    imageSrc: "",
    shareKey: ""
  },
  onLoad(options) {
    const opts = (options && typeof options === "object") ? options : {}
    const imageSrc = String(opts.src || "").trim()
    const shareKey = String(opts.key || "").trim()
    this.setData({ imageSrc, shareKey })
  }
})
