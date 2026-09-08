Page({
  data: {
    shareKey: "tyre-icon",
    imageSrc: "/assets/icons/tyre-blue-icon.png"
  },
  onLoad(query) {
    const src = query && query.src ? decodeURIComponent(String(query.src)) : this.data.imageSrc
    const key = query && query.key ? decodeURIComponent(String(query.key)) : this.data.shareKey
    this.setData({ imageSrc: src, shareKey: key })
  }
})
