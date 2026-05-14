Component({
  properties: {
    value: { type: Array, value: ["speed", "rpm"] }
  },
  methods: {
    onChange(e: any) {
      this.triggerEvent("change", { value: e?.detail?.value ?? [] })
    }
  }
})

