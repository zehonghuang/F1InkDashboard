Page({
  data: {
    cards: [
      {
        id: "n1",
        tag: "FIA / 规则",
        time: "刚刚",
        title: "2026 赛季新规要点速览：动力单元与空气动力学方向",
        summary: "整理动力单元、电能占比、DRS 变化等核心信息，方便快速了解新规影响。"
      },
      {
        id: "n2",
        tag: "围场动态",
        time: "2 小时前",
        title: "车队升级进度跟踪：本周末主要部件更新清单",
        summary: "按车队梳理前翼、底板、散热与尾翼变化，并标注升级意图与风险点。"
      },
      {
        id: "n3",
        tag: "赛道 / 轮胎",
        time: "昨天",
        title: "本站轮胎策略前瞻：长距离衰减与进站窗口推演",
        summary: "结合练习赛长距离与历史数据，给出 1/2 停策略对比与关键触发条件。"
      },
      {
        id: "n4",
        tag: "人物",
        time: "05.26",
        title: "车手专访节选：如何在高温下保持轮胎温度窗口",
        summary: "从驾驶风格、刹车点与能量回收入手，拆解“保胎”的具体操作。"
      }
    ]
  },
  onLoad() {},
  onShow() {
    if (typeof this.getTabBar === "function") {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === "function") {
        tb.setSelectedByRoute(this.route)
      }
    }
  },
  onPullDownRefresh() {
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 500)
  },
  onTapCard(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/news-detail/index?id=${encodeURIComponent(id)}` })
  }
})
