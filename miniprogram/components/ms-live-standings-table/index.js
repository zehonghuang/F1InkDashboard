Component({
  properties: {
    title: { type: String, value: '' },
    rows: { type: Array, value: [] },
    maxRows: { type: Number, value: 0 },
    dense: { type: Boolean, value: true },
    bodyHeightRpx: { type: Number, value: 720 },
  },
  data: {
    displayRows: [],
  },
  observers: {
    'rows,maxRows': function (rows, maxRows) {
      const list = Array.isArray(rows) ? rows : []
      const n = typeof maxRows === 'number' && maxRows > 0 ? maxRows : list.length
      const displayRows = list.slice(0, n).map((it, idx) => {
        const row = Object.assign({}, it || {})
        const tyreParts = []
        if (row.tyre) tyreParts.push({ text: String(row.tyre), primary: true })
        if (Number(row.laps) > 0) tyreParts.push({ text: `${Number(row.laps)}L`, primary: false })
        if (Number(row.pitCount || row.pit_count) > 0) {
          tyreParts.push({ text: `${Number(row.pitCount || row.pit_count)}Pit`, primary: false })
        }
        row.tyreParts = tyreParts.length ? tyreParts : [{ text: '--', primary: false }]
        row.position = Number(row.position || row.pos || idx + 1)
        row.teamColor = String(row.teamColor || row.team_color || '#64748b')
        row.driver = String(row.driver || '-')
        row.driverShort = formatDriverName(row.driver)
        row.team = String(row.team || '-')
        row.gap = String(row.gap || '')
        row.time = String(row.time || '-')
        return row
      })
      this.setData({ displayRows })
    },
  },
})

function formatDriverName(name) {
  const text = String(name || '').trim()
  if (!text || text === '-') return '-'
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return text
  const first = parts[0]
  const last = parts[parts.length - 1]
  const initial = first.charAt(0).toUpperCase()
  return `${initial}. ${last}`
}
