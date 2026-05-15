Page({
  data: {
    query: "",
    races: [
      {
        id: "R07",
        title: "R07 摩纳哥大奖赛（05.24）",
        label: "最快圈: 1:32.405 | 遥测: 已就绪"
      },
      {
        id: "R06",
        title: "R06 迈阿密大奖赛（05.03）",
        label: "最快圈: 1:29.802 | 遥测: 已就绪"
      },
      {
        id: "R05",
        title: "R05 中国大奖赛（04.19）",
        label: "最快圈: 1:37.521 | 遥测: 已就绪"
      },
      {
        id: "R04",
        title: "R04 日本大奖赛（04.05）",
        label: "最快圈: 1:33.784 | 遥测: 已就绪"
      }
    ]
  },
  onShow() {
    if (typeof this.getTabBar === 'function') {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === 'function') {
        tb.setSelectedByRoute(this.route)
      }
    }
  },
  onRaceTap(e) {
    const { id } = e.currentTarget.dataset
    wx.showToast({
      title: `${id} 遥测已就绪`,
      icon: "none"
    })
  },
  onGoCompare() {
    wx.switchTab({ url: "/pages/compare/index" })
  },
  onQueryChange(e) {
    this.setData({ query: e.detail.value })
  },
  onSearch() {
    const q = (this.data.query || "").trim()
    wx.showToast({
      title: q ? `检索: ${q}` : "请输入赛道或日期",
      icon: "none"
    })
  }
})
