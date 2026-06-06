Component({
  properties: {
    title: { type: String, value: '' },
    rows: { type: Array, value: [] },
    maxRows: { type: Number, value: 0 },
    dense: { type: Boolean, value: true },
    bodyHeightRpx: { type: Number, value: 560 },
  },
  data: {
    displayRows: [],
  },
  observers: {
    'rows,maxRows': function (rows, maxRows) {
      const list = Array.isArray(rows) ? rows : []
      const n = typeof maxRows === 'number' && maxRows > 0 ? maxRows : list.length
      this.setData({ displayRows: list.slice(0, n) })
    },
  },
  methods: {},
})
