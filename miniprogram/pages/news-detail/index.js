const { getMockNewsById } = require("../../services/newsService")

Page({
  data: {
    id: "",
    title: "",
    tagText: "",
    timeText: "",
    contentText: ""
  },
  onLoad(query) {
    const id = (query && query.id) || ""
    const matched = getMockNewsById(id) || getMockNewsById("n_20260526_hero_rules")
    this.setData({
      id: matched ? matched.id : "",
      title: matched ? matched.title : "",
      tagText: matched ? matched.tagText : "",
      timeText: matched ? matched.timeText : "",
      contentText:
        matched && matched.content && matched.content.formatCode === "PLAIN" ? matched.content.text || "" : ""
    })
  }
})
