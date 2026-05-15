Component({
  data: {
    selected: 'archive',
    list: [
      {
        key: 'archive',
        pagePath: '/pages/archive/index',
        img: '/assets/tabbar/archive.png',
        currentImg: '/assets/tabbar/archive_selected.png'
      },
      {
        key: 'compare',
        pagePath: '/pages/compare/index',
        img: '/assets/tabbar/compare.png',
        currentImg: '/assets/tabbar/compare_selected.png'
      },
      {
        key: 'mine',
        pagePath: '/pages/mine/index',
        img: '/assets/tabbar/mine.png',
        currentImg: '/assets/tabbar/mine_selected.png'
      }
    ]
  },
  methods: {
    setSelectedByRoute(route) {
      const matched = this.data.list.find((x) => x.pagePath === `/${route}`)
      this.setData({ selected: matched ? matched.key : 'archive' })
    },
    onTapItem(e) {
      const { key } = e.currentTarget.dataset
      const item = this.data.list.find((x) => x.key === key)
      if (!item) return
      wx.switchTab({ url: item.pagePath })
    }
  }
})
