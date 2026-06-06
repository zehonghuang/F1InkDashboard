Component({
  properties: {
    title: { type: String, value: '' },
    rows: { type: Array, value: [] },
    showAllStats: { type: Boolean, value: false },
  },
  methods: {
    onToggleAllStats(e) {
      this.triggerEvent('toggleallstats', { value: !!e.detail.value })
    },
  },
})
