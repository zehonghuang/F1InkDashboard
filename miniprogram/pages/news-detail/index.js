Page({
  data: {
    id: "",
    title: "",
    tag: "",
    time: "",
    content: ""
  },
  onLoad(query) {
    const id = (query && query.id) || ""
    const list = [
      {
        id: "n1",
        tag: "FIA / 规则",
        time: "刚刚",
        title: "2026 赛季新规要点速览：动力单元与空气动力学方向",
        content:
          "这里先做占位。后续接入接口后，可以把正文以富文本（rich-text）或 WebView 阅读原文的方式展示。"
      },
      {
        id: "n2",
        tag: "围场动态",
        time: "2 小时前",
        title: "车队升级进度跟踪：本周末主要部件更新清单",
        content: "这里先做占位。后续正文可从后端聚合并缓存。"
      },
      {
        id: "n3",
        tag: "赛道 / 轮胎",
        time: "昨天",
        title: "本站轮胎策略前瞻：长距离衰减与进站窗口推演",
        content: "这里先做占位。后续可以加入策略图表与关键段落高亮。"
      },
      {
        id: "n4",
        tag: "人物",
        time: "05.26",
        title: "车手专访节选：如何在高温下保持轮胎温度窗口",
        content: "这里先做占位。后续可以支持分段引用、收藏与分享。"
      }
    ]
    const matched = list.find((x) => x.id === id) || list[0]
    this.setData({
      id: matched ? matched.id : "",
      title: matched ? matched.title : "",
      tag: matched ? matched.tag : "",
      time: matched ? matched.time : "",
      content: matched ? matched.content : ""
    })
  }
})
