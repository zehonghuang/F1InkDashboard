const { fetchNewsDetail } = require("../../services/mpNewsApi")

Page({
  data: {
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
  onLoad(query) {
    const id = (query && query.id) || ""
    if (!id) {
      this.setData({ errorText: "缺少资讯 ID" })
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
        })
      })
      .catch(() => {
        this.setData({ loading: false, errorText: "加载失败" })
      })
  }
})
