Component({
  properties: {
    value: { type: Array, value: ["speed", "rpm"] }
  },
  methods: {
    onChange(e) {
      this.triggerEvent("change", { value: (e && e.detail && e.detail.value) || [] })
    }
  }
})

