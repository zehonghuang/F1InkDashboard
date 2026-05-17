const echarts = require('./vendor/echarts')
const wxCanvasMod = require('./vendor/wx-canvas')
const WxCanvas = (wxCanvasMod && (wxCanvasMod.default || wxCanvasMod)) || wxCanvasMod

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas'
    },
    option: {
      type: Object,
      value: null
    }
  },
  data: {
    inited: false,
    isUseNewCanvas: false
  },
  lifetimes: {
    ready() {
      this.init()
    },
    detached() {
      if (this._chart) {
        try {
          this._chart.dispose()
        } catch (e) {}
        this._chart = null
      }
    }
  },
  observers: {
    option(v) {
      if (v) {
        this.setOption(v)
      }
    }
  },
  methods: {
    init() {
      if (this.data.inited) return
      const version = wx.getSystemInfoSync().SDKVersion
      const canUseNewCanvas = this.compareVersion(version, '2.9.0') >= 0
      const isUseNewCanvas = canUseNewCanvas
      this.setData({ isUseNewCanvas })
      if (isUseNewCanvas) {
        this.initByNewWay()
      } else {
        this.initByOldWay()
      }
    },
    initByOldWay() {
      const canvasId = this.data.canvasId
      const ctx = wx.createCanvasContext(canvasId, this)
      const canvas = new WxCanvas(ctx, canvasId, false)
      if (typeof echarts.setCanvasCreator === 'function') {
        echarts.setCanvasCreator(() => canvas)
      }
      const query = wx.createSelectorQuery().in(this)
      query
        .select('.ec-canvas')
        .boundingClientRect((res) => {
          const w = res && res.width
          const h = res && res.height
          if (!w || !h) return
          const dpr = 1
          this._chart = echarts.init(canvas, null, { width: w, height: h, devicePixelRatio: dpr })
          canvas.setChart(this._chart)
          this.setData({ inited: true }, () => {
            if (this.data.option) this.setOption(this.data.option)
          })
        })
        .exec()
    },
    initByNewWay() {
      const query = wx.createSelectorQuery().in(this)
      query
        .select('.ec-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const info = res && res[0]
          const canvasNode = info && info.node
          const width = info && info.width
          const height = info && info.height
          if (!canvasNode || !width || !height) return
          const dpr = wx.getSystemInfoSync().pixelRatio || 2
          const ctx = canvasNode.getContext('2d')
          const canvas = new WxCanvas(ctx, this.data.canvasId, true, canvasNode)
          if (typeof echarts.setCanvasCreator === 'function') {
            echarts.setCanvasCreator(() => canvas)
          }
          this._chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr })
          canvas.setChart(this._chart)
          this.setData({ inited: true }, () => {
            if (this.data.option) this.setOption(this.data.option)
          })
        })
    },
    setOption(option) {
      this.init()
      if (!this._chart) {
        this._pendingOption = option
        return
      }
      try {
        this._chart.setOption(option, true)
      } catch (e) {}
    },
    touchStart(e) {
      if (this._chart && e.touches && e.touches.length) {
        const t = e.touches[0]
        const handler = this._chart.getZr().handler
        handler.dispatch('mousedown', { zrX: t.x, zrY: t.y })
        handler.dispatch('mousemove', { zrX: t.x, zrY: t.y })
      }
    },
    touchMove(e) {
      if (this._chart && e.touches && e.touches.length) {
        const t = e.touches[0]
        const handler = this._chart.getZr().handler
        handler.dispatch('mousemove', { zrX: t.x, zrY: t.y })
      }
    },
    touchEnd(e) {
      if (this._chart) {
        const t = (e.changedTouches && e.changedTouches[0]) || {}
        const handler = this._chart.getZr().handler
        handler.dispatch('mouseup', { zrX: t.x, zrY: t.y })
        handler.dispatch('click', { zrX: t.x, zrY: t.y })
      }
    },
    compareVersion(v1, v2) {
      v1 = String(v1 || '').split('.')
      v2 = String(v2 || '').split('.')
      const len = Math.max(v1.length, v2.length)
      while (v1.length < len) v1.push('0')
      while (v2.length < len) v2.push('0')
      for (let i = 0; i < len; i++) {
        const n1 = parseInt(v1[i], 10)
        const n2 = parseInt(v2[i], 10)
        if (n1 > n2) return 1
        if (n1 < n2) return -1
      }
      return 0
    }
  }
})
