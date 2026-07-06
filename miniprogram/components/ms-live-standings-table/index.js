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
  lifetimes: {
    attached() {
      this._rowLayoutMap = {}
      this._reorderTimer = null
      this._isAnimating = false
      this._pendingDisplayRows = null
    },
    detached() {
      clearTimeout(this._reorderTimer)
    },
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
        row.number = String(row.number || row.racing_number || '')
        row.tla = String(row.tla || '')
        row.teamColor = String(row.teamColor || row.team_color || '#64748b')
        row.driver = String(row.driver || '-')
        row.driverShort = formatDriverName(row.driver)
        row.team = String(row.team || '-')
        row.gap = String(row.gap || '')
        row.time = String(row.time || '-')
        row.rowKey = buildRowKey(row, idx)
        row.animStyle = ''
        row.animClass = ''
        row.moveClass = ''
        row.moveText = ''
        return row
      })
      if (this._isAnimating) {
        this._pendingDisplayRows = displayRows
        return
      }
      this.applyDisplayRows(displayRows)
    },
  },
  methods: {
    applyDisplayRows(nextRows) {
      if (this._isAnimating) {
        this._pendingDisplayRows = nextRows
        return
      }
      const prevRows = Array.isArray(this.data.displayRows) ? this.data.displayRows : []
      const prevLayoutMap = this._rowLayoutMap || {}
      const hasPrevLayout = Object.keys(prevLayoutMap).length > 0
      const prevIndexMap = {}
      const nextIndexMap = {}

      prevRows.forEach((row, index) => {
        if (!row || !row.rowKey) return
        prevIndexMap[row.rowKey] = index
      })
      nextRows.forEach((row, index) => {
        if (!row || !row.rowKey) return
        nextIndexMap[row.rowKey] = index
      })

      clearTimeout(this._reorderTimer)

      this.setData({ displayRows: nextRows }, () => {
        this.measureRowLayout((nextLayoutMap) => {
          this._rowLayoutMap = nextLayoutMap
          if (!hasPrevLayout) return

          const animatedRows = this.data.displayRows.map((row) => {
            const prevLayout = prevLayoutMap[row.rowKey]
            const nextLayout = nextLayoutMap[row.rowKey]
            const prevIndex = prevIndexMap[row.rowKey]
            const nextIndex = nextIndexMap[row.rowKey]
            const hasOrderChanged = typeof prevIndex === 'number' && typeof nextIndex === 'number' && prevIndex !== nextIndex

            if (!prevLayout || !nextLayout || !hasOrderChanged) {
              return row
            }
            const deltaY = Math.round((prevLayout.top - nextLayout.top) * 100) / 100
            if (!deltaY) {
              return row
            }
            const animClass = deltaY > 0 ? 'mslt-row-rise' : 'mslt-row-fall'
            const moveCount = Math.abs(prevIndex - nextIndex)
            const moveClass = deltaY > 0 ? 'mslt-move-up' : 'mslt-move-down'
            const moveText = deltaY > 0 ? `▲${moveCount}` : `▼${moveCount}`
            return Object.assign({}, row, {
              animClass,
              moveClass,
              moveText,
              animStyle: `transform: translateY(${deltaY}px) scale(0.985); opacity: 0.92;`,
            })
          })

          const shouldAnimate = animatedRows.some((row) => row.animStyle)
          if (!shouldAnimate) {
            this.flushPendingDisplayRows()
            return
          }

          this._isAnimating = true

          this.setData({ displayRows: animatedRows }, () => {
            wx.nextTick(() => {
              const settledRows = this.data.displayRows.map((row) => {
                if (!row.animStyle) return row
                return Object.assign({}, row, {
                  animStyle: 'transform: translateY(0) scale(1); opacity: 1; transition: transform 620ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease-out, box-shadow 620ms ease-out, background-color 620ms ease-out;',
                })
              })

              this.setData({ displayRows: settledRows })

              this._reorderTimer = setTimeout(() => {
                const clearedRows = this.data.displayRows.map((row) => {
                  if (!row.animStyle) return row
                  return Object.assign({}, row, { animStyle: '', animClass: '', moveClass: '', moveText: '' })
                })
                this.setData({ displayRows: clearedRows }, () => {
                  this.measureRowLayout((layoutMap) => {
                    this._rowLayoutMap = layoutMap
                    this._isAnimating = false
                    this.flushPendingDisplayRows()
                  })
                })
              }, 760)
            })
          })
        })
      })
    },
    flushPendingDisplayRows() {
      const pending = this._pendingDisplayRows
      if (!pending || this._isAnimating) return
      this._pendingDisplayRows = null
      this.applyDisplayRows(pending)
    },
    measureRowLayout(done) {
      wx.nextTick(() => {
        const query = wx.createSelectorQuery().in(this)
        query.select('.mslt-scroll').boundingClientRect()
        query.select('.mslt-scroll').scrollOffset()
        query.selectAll('.mslt-data-row').boundingClientRect()
        query.exec((res) => {
          const scrollRect = (res && res[0]) || null
          const scrollOffset = (res && res[1]) || null
          const rects = (res && res[2]) || []
          const rows = this.data.displayRows || []
          const layoutMap = {}
          const containerTop = Number(scrollRect && scrollRect.top) || 0
          const scrollTop = Number(scrollOffset && scrollOffset.scrollTop) || 0

          ;(rects || []).forEach((rect, index) => {
            const row = rows[index]
            if (!row || !row.rowKey || !rect) return
            layoutMap[row.rowKey] = {
              // Use coordinates relative to scroll content so page/table scrolling
              // does not make unchanged rows look like they moved.
              top: (Number(rect.top) || 0) - containerTop + scrollTop,
              height: Number(rect.height) || 0,
            }
          })
          if (typeof done === 'function') done(layoutMap)
        })
      })
    },
    onRowLongPress(event) {
      const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index)
      const rows = Array.isArray(this.data.displayRows) ? this.data.displayRows : []
      const row = Number.isFinite(index) ? rows[index] : null
      if (!row) return
      this.triggerEvent("rowlongpress", {
        row,
        point: extractTouchPoint(event),
      })
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

function buildRowKey(row, idx) {
  const driver = String(row.driver || '').trim()
  const team = String(row.team || '').trim()
  const number = String(row.number || '').trim()
  const fallback = String(row.driverShort || row.position || idx).trim()
  return [driver, team, number || fallback].join('|')
}

function extractTouchPoint(event) {
  const touch =
    (event && event.changedTouches && event.changedTouches[0]) ||
    (event && event.touches && event.touches[0]) ||
    null
  if (!touch) return null
  return {
    x: Number(touch.clientX) || 0,
    y: Number(touch.clientY) || 0,
  }
}
