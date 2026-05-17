Component({
  externalClasses: ['i-class'],
  options: {
    multipleSlots: true
  },
  data: {
    currentThumb: ''
  },
  properties: {
    full: {
      type: Boolean,
      value: false
    },
    thumb: {
      type: String,
      value: ''
    },
    fallbackThumb: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: ''
    },
    extra: {
      type: String,
      value: ''
    }
  },
  observers: {
    thumb(v) {
      this.setData({ currentThumb: v || '' })
    }
  },
  methods: {
    onThumbError() {
      const fb = this.data.fallbackThumb || ''
      if (fb && this.data.currentThumb !== fb) {
        this.setData({ currentThumb: fb })
      }
    }
  }
})
