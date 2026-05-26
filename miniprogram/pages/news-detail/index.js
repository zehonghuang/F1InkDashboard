const { getMockNewsById } = require("../../services/newsService")

Page({
  data: {
    id: "",
    title: "",
    tagText: "",
    timeText: "",
    contentFormatCode: "PLAIN",
    contentText: "",
    contentNodes: []
  },
  onLoad(query) {
    const id = (query && query.id) || ""
    const matched = getMockNewsById(id) || getMockNewsById("n_20260526_hero_rules")
    const content = (matched && matched.content) || { formatCode: "PLAIN", text: "" }
    this.setData({
      id: matched ? matched.id : "",
      title: matched ? matched.title : "",
      tagText: matched ? matched.tagText : "",
      timeText: matched ? matched.timeText : "",
      contentFormatCode: content.formatCode || "PLAIN",
      contentText: content.formatCode === "PLAIN" ? content.text || "" : "",
      contentNodes: content.formatCode === "RICH_TEXT_NODES" ? content.nodes || [] : []
    })
  }
})
