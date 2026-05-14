Component({
  properties: {
    bordered: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      this.triggerEvent("click")
    }
  }
})

