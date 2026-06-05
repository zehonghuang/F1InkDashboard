const { fetchNewsDetail } = require("../../services/mpNewsApi")
const i18n = require("../../services/i18n")

Page({
  data: {
    i18n: i18n.getDict(),
    id: "",
    title: "",
    tagText: "",
    timeText: "",
    contentFormatCode: "PLAIN",
    contentText: "",
    contentNodes: [],
    loading: false,
    errorText: ""
  },
  onShareAppMessage() {
    const id = String(this.data.id || "").trim()
    const title = String(this.data.title || "").trim() || i18n.t("newsDetail.title")
    const path = id ? `/pages/news-detail/index?id=${encodeURIComponent(id)}` : "/pages/news/index"
    return { title, path }
  },
  onLoad(query) {
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n())
    this.applyI18n()
    const id = (query && query.id) || ""
    if (!id) {
      this.setData({ errorText: i18n.t("newsDetail.missingId") })
      return
    }
    this.setData({ loading: true, errorText: "" })
    fetchNewsDetail({ id, tz: "Asia/Shanghai" })
      .then((matched) => {
        const content = (matched && matched.content) || { formatCode: "PLAIN", text: "", nodes: [] }
        this.setData({
          id: matched ? matched.id : "",
          title: matched ? matched.title : "",
          tagText: matched ? matched.tagText : "",
          timeText: matched ? matched.timeText : "",
          contentFormatCode: content.formatCode || "PLAIN",
          contentText: content.formatCode === "PLAIN" ? content.text || "" : "",
          contentNodes: content.formatCode === "RICH_TEXT_NODES" ? content.nodes || [] : [],
          loading: false
        }, () => {
          const tt = String(this.data.title || "").trim()
          wx.setNavigationBarTitle({ title: tt || i18n.t("newsDetail.title") })
        })
      })
      .catch(() => {
        this.setData({ loading: false, errorText: i18n.t("newsDetail.loadFailed") })
      })
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  applyI18n() {
    const dict = i18n.getDict()
    this.setData({ i18n: dict })
    const tt = String(this.data.title || "").trim()
    wx.setNavigationBarTitle({ title: tt || dict.newsDetail.title })
  }
})
