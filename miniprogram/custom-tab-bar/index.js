Component({
  data: {
    visible: true,
    selected: 'news',
    list: [
      {
        key: 'news',
        pagePath: '/pages/news/index',
        icon: 'document'
      },
      {
        key: 'archive',
        pagePath: '/pages/archive/index',
        icon: 'barrage'
      },
      {
        key: 'mine',
        pagePath: '/pages/mine/index',
        icon: 'mine'
      }
    ]
  },
  methods: {
    setVisible(visible) {
      this.setData({ visible: Boolean(visible) })
    },
    setSelectedByRoute(route) {
      const matched = this.data.list.find((x) => x.pagePath === `/${route}`)
      this.setData({ selected: matched ? matched.key : 'news' })
    },
    onTapItem(e) {
      const { key } = e.currentTarget.dataset
      const item = this.data.list.find((x) => x.key === key)
      if (!item) return
      this.setData({ selected: key })
      wx.switchTab({ url: item.pagePath })
    }
  }
})
