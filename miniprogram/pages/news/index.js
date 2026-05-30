const { LAYOUT_CODE } = require("../../services/newsService")
const { fetchNewsList } = require("../../services/mpNewsApi")

const WELCOME_KEY = "news_welcome_shown_v1"
const PREF_TEAMS_KEY = "pref_follow_teams"
const PREF_DRIVERS_KEY = "pref_follow_drivers"
const PREFS_INITED_KEY = "pref_prefs_inited"

function normalizeText(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
}

function getLocalPrefs() {
  let followTeams = []
  let followDrivers = []

  try {
    const app = getApp()
    const gp = app && app.globalData && app.globalData.prefs
    if (gp) {
      followTeams = Array.isArray(gp.followTeams) ? gp.followTeams : []
      followDrivers = Array.isArray(gp.followDrivers) ? gp.followDrivers : []
    }
  } catch (e) {}

  if (!followTeams.length) {
    try {
      const xs = wx.getStorageSync(PREF_TEAMS_KEY)
      if (Array.isArray(xs)) {
        followTeams = xs.map((x) => String(x || "").trim()).filter(Boolean)
      }
    } catch (e) {}
  }

  if (!followDrivers.length) {
    try {
      const xs = wx.getStorageSync(PREF_DRIVERS_KEY)
      if (Array.isArray(xs)) {
        followDrivers = xs.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      }
    } catch (e) {}
  }

  return { followTeams, followDrivers }
}

function isHitPrefs(item, prefs) {
  const teams = Array.isArray(prefs && prefs.followTeams) ? prefs.followTeams : []
  const drivers = Array.isArray(prefs && prefs.followDrivers) ? prefs.followDrivers : []
  if (!teams.length && !drivers.length) return false

  const tags = Array.isArray(item && item.tags) ? item.tags.map((x) => normalizeText(x)) : []
  const hay = normalizeText(`${(item && item.tagText) || ""} ${(item && item.title) || ""} ${(item && item.summary) || ""}`)

  const hitTeam = teams.some((t) => {
    const key = normalizeText(t)
    if (!key) return false
    if (tags.includes(key)) return true
    if (hay.includes(key)) return true
    return false
  })
  if (hitTeam) return true

  const hitDriver = drivers.some((n) => {
    const key = normalizeText(String(n))
    if (!key) return false
    if (tags.includes(key)) return true
    if (hay.includes(key)) return true
    return false
  })
  return hitDriver
}

function promoteNewHitItems({ prevList, nextList, prefs }) {
  const prev = Array.isArray(prevList) ? prevList : []
  const next = Array.isArray(nextList) ? nextList : []
  if (!prev.length) return { list: next, promotedIds: [] }

  const prevIds = new Set(prev.map((x) => (x && x.id ? x.id : "")).filter(Boolean))
  const nextById = new Map()
  for (const it of next) {
    if (it && it.id) nextById.set(it.id, it)
  }

  const newItems = []
  for (const it of next) {
    if (!it || !it.id || prevIds.has(it.id)) continue
    newItems.push(it)
  }

  const promoted = []
  const otherNew = []
  for (const it of newItems) {
    if (isHitPrefs(it, prefs)) promoted.push(it)
    else otherNew.push(it)
  }

  const promotedIds = promoted.map((x) => x.id)
  const existingInPrevOrder = []
  for (const it of prev) {
    if (!it || !it.id) continue
    const updated = nextById.get(it.id)
    if (updated) existingInPrevOrder.push(updated)
  }

  return { list: [...promoted, ...otherNew, ...existingInPrevOrder], promotedIds }
}

function buildPrefPromotePlan({ prevList, nextList, prefs }) {
  const prev = Array.isArray(prevList) ? prevList : []
  const next = Array.isArray(nextList) ? nextList : []
  if (!prev.length) {
    return { moveId: "", initialList: next, finalList: next, promotedIds: [] }
  }

  const prevIds = new Set(prev.map((x) => (x && x.id ? x.id : "")).filter(Boolean))
  const nextById = new Map()
  for (const it of next) {
    if (it && it.id) nextById.set(it.id, it)
  }

  const newItems = []
  for (const it of next) {
    if (!it || !it.id || prevIds.has(it.id)) continue
    newItems.push(it)
  }

  const promoted = []
  const otherNew = []
  for (const it of newItems) {
    if (isHitPrefs(it, prefs)) promoted.push(it)
    else otherNew.push(it)
  }

  const existingInPrevOrder = []
  for (const it of prev) {
    if (!it || !it.id) continue
    const updated = nextById.get(it.id)
    if (updated) existingInPrevOrder.push(updated)
  }

  const promotedIds = promoted.map((x) => x.id)
  const moveId = promotedIds.length ? promotedIds[0] : ""

  const finalList = [...promoted, ...otherNew, ...existingInPrevOrder].map((x) => {
    if (!x || !x.id) return x
    if (!promotedIds.includes(x.id)) return x
    return { ...x, _prefPromoted: true }
  })

  if (!moveId) {
    return { moveId: "", initialList: finalList, finalList, promotedIds }
  }

  const initialList = [...otherNew, ...existingInPrevOrder]

  return { moveId, initialList, finalList, promotedIds }
}

function shouldEnablePrefPromoteDemo() {
  try {
    const app = getApp()
    const ds = app && app.globalData && app.globalData.newsDataSource
    if (ds === "mock") return true
    return String(wx.getStorageSync("news_demo_pref_promote") || "") === "1"
  } catch (e) {
    return false
  }
}

function buildDemoNewsItems(prefs) {
  const teams = Array.isArray(prefs && prefs.followTeams) ? prefs.followTeams : []
  const drivers = Array.isArray(prefs && prefs.followDrivers) ? prefs.followDrivers : []
  if (!teams.length && !drivers.length) return []
  const team = String(teams[0] || "Mercedes").trim() || "Mercedes"
  const dn = Number(drivers[0] || 63) || 63
  const now = new Date()
  const iso = now.toISOString()
  const hitId = `demo_pref_hit_${team.replace(/\s+/g, "_").toLowerCase()}_${String(dn)}`
  return [
    {
      id: hitId,
      layoutCode: LAYOUT_CODE.STANDARD,
      heroDisplayCode: "",
      typeCode: "PADDOCK",
      pinned: false,
      weight: 0,
      tagText: `${team} / Demo`,
      tags: [team, String(dn)],
      title: `【Demo】${team} 动态：与 ${dn} 号车手相关的新消息`,
      summary: `用于演示“命中偏好即置顶”。关注车队/车手命中后，这条会在下拉刷新时被挪到表头并滑入。`,
      coverUrl: "",
      publishedAt: iso,
      timeText: "刚刚",
      source: { name: "Mock", url: "" },
      content: { formatCode: "PLAIN", text: "仅用于前端演示。" },
      _demo: true
    },
    {
      id: `demo_pref_miss_${Date.now()}`,
      layoutCode: LAYOUT_CODE.STANDARD,
      heroDisplayCode: "",
      typeCode: "PADDOCK",
      pinned: false,
      weight: 0,
      tagText: "Demo",
      tags: ["demo"],
      title: "【Demo】不命中偏好的新资讯",
      summary: "用于演示对比：这条不会被置顶，只会按新增插入在置顶组之后。",
      coverUrl: "",
      publishedAt: iso,
      timeText: "刚刚",
      source: { name: "Mock", url: "" },
      content: { formatCode: "PLAIN", text: "仅用于前端演示。" },
      _demo: true
    }
  ]
}

Page({
  data: {
    banners: [],
    list: [],
    welcome: null,
    showWelcome: false,
    loading: false,
    errorText: "",
    page: 1,
    pageSize: 20,
    hasMore: true,
    statusBarHeight: 0,
    prefMoveOverlay: null,
    listTransformStyle: "",
    refreshing: false
  },
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
      const ww = Number(sys && sys.windowWidth) || 0
      this._pxPerRpx = ww > 0 ? ww / 750 : 0
    } catch (e) {}
    this.setListOffset(0, 0)
    this._useScrollViewRefresher = true
    this.reload()
  },
  onUnload() {
    clearTimeout(this._prefPromotedTimer)
    clearTimeout(this._prefMoveTimer)
    clearTimeout(this._prefMoveTimer2)
    clearTimeout(this._waitTopTimer)
  },
  onShow() {
    if (typeof this.getTabBar === "function") {
      const tb = this.getTabBar()
      if (tb && typeof tb.setSelectedByRoute === "function") {
        tb.setSelectedByRoute(this.route)
      }
      if (tb && typeof tb.setVisible === "function") {
        tb.setVisible(!this.data.showWelcome)
      }
    }
  },
  onReady() {
    this.initWorklet()
  },
  onPullDownRefresh() {
    if (this._useScrollViewRefresher) return
    this.reload({ stopRefresh: true, reset: true, softReset: true })
  },
  onRefresherRefresh() {
    if (this.data.loading) {
      this.setData({ refreshing: false })
      return
    }
    this.setData({ refreshing: true }, () => {
      this.reload({ stopRefresh: true, reset: true, softReset: true })
    })
  },
  onPageScroll(e) {
    const top = e && e.detail && typeof e.detail.scrollTop === "number" ? e.detail.scrollTop : 0
    this._scrollTop = top
  },
  onScrollToLower() {
    this.onReachBottom()
  },
  reload(opts) {
    if (this.data.loading) return
    const reset = !opts || opts.reset !== false
    const softReset = Boolean(opts && opts.softReset)
    const nextPage = reset ? 1 : Number((opts && opts.page) || this.data.page || 1)
    if (reset) {
      if (softReset) {
        this.setData({ loading: true, errorText: "", page: 1, hasMore: true })
      } else {
        this.setData({ loading: true, errorText: "", page: 1, hasMore: true, banners: [], list: [], welcome: null, showWelcome: false })
      }
    } else {
      this.setData({ loading: true, errorText: "" })
    }
    const done = () => {
      if (opts && opts.stopRefresh) {
        if (this._useScrollViewRefresher) {
          this.setData({ refreshing: false })
        } else {
          wx.stopPullDownRefresh()
        }
      }
      this.setData({ loading: false })
    }

    fetchNewsList({ page: nextPage, pageSize: this.data.pageSize, tz: "Asia/Shanghai" })
      .then((res) => {
        const items = (res && res.items) || []
        if (reset) {
          const prevList = softReset ? this.data.list || [] : []
          const breaking = items.find((x) => x && x.layoutCode === LAYOUT_CODE.BREAKING) || null
          const heroBanners = items.filter((x) => x && x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER")
          const banners = breaking ? [breaking, ...heroBanners] : heroBanners
          const rest = items.filter((x) => {
            if (!x) return false
            if (breaking && x.id === breaking.id) return false
            if (x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER") return false
            return true
          })

          let nextList = rest
          let promotedIds = []
          let pendingMoveId = ""
          let pendingFinalList = null
          if (softReset && Array.isArray(prevList) && prevList.length) {
            const prefs = getLocalPrefs()
            let restWithDemo = rest
            if (shouldEnablePrefPromoteDemo()) {
              const demo = buildDemoNewsItems(prefs)
              const seen = new Set(rest.map((x) => (x && x.id ? x.id : "")).filter(Boolean))
              const inject = demo.filter((x) => x && x.id && !seen.has(x.id))
              restWithDemo = inject.length ? [...rest, ...inject] : rest
            }
            const plan = buildPrefPromotePlan({ prevList, nextList: restWithDemo, prefs })
            promotedIds = plan.promotedIds
            pendingMoveId = plan.moveId
            pendingFinalList = plan.moveId ? plan.finalList : null
            nextList = plan.initialList
          }

          let showWelcome = false
          if (breaking) {
            const shown = Boolean(wx.getStorageSync(WELCOME_KEY))
            showWelcome = !shown
            if (showWelcome) {
              wx.setStorageSync(WELCOME_KEY, "1")
            }
          }

          const hasMore = (Number(res.page || 1) * Number(res.pageSize || this.data.pageSize || 20)) < Number(res.total || 0)
          this.setData({ banners, list: nextList, welcome: breaking, showWelcome, page: Number(res.page || 1), hasMore }, () => {
            if (typeof this.getTabBar === "function") {
              const tb = this.getTabBar()
              if (tb && typeof tb.setVisible === "function") {
                tb.setVisible(!showWelcome)
              }
            }
            done()
            if (pendingMoveId && pendingFinalList) {
              this.waitForReboundToTop(() => {
                this.startPrefMoveToTop({ id: pendingMoveId, finalList: pendingFinalList })
              })
            } else if (promotedIds && promotedIds.length) {
              clearTimeout(this._prefPromotedTimer)
              this._prefPromotedTimer = setTimeout(() => {
                const list = (this.data.list || []).map((x) => {
                  if (!x || !x.id) return x
                  if (!x._prefPromoted) return x
                  return { ...x, _prefPromoted: false }
                })
                this.setData({ list })
              }, 650)
            }
          })
          return
        }

        const bannerIds = new Set()
        for (const b of this.data.banners || []) {
          if (b && b.id) bannerIds.add(b.id)
        }
        const next = items.filter((x) => {
          if (!x || !x.id) return false
          if (bannerIds.has(x.id)) return false
          if (x.layoutCode === LAYOUT_CODE.BREAKING) return false
          if (x.layoutCode === LAYOUT_CODE.HERO && x.heroDisplayCode === "BANNER") return false
          return true
        })
        const seen = new Set((this.data.list || []).map((x) => (x && x.id ? x.id : "")))
        const merged = [...(this.data.list || [])]
        for (const it of next) {
          if (!it || !it.id || seen.has(it.id)) continue
          seen.add(it.id)
          merged.push(it)
        }
        const hasMore = (Number(res.page || 1) * Number(res.pageSize || this.data.pageSize || 20)) < Number(res.total || 0)
        this.setData({ list: merged, page: Number(res.page || 1), hasMore }, done)
      })
      .catch(() => {
        this.setData({ errorText: "加载失败，请下拉重试" }, () => done())
      })
  },
  setListOffset(y, duration, timingFunction) {
    if (this._workletEnabled) return
    const yy = Math.round(Number(y) || 0)
    const d = Math.max(0, Math.round(Number(duration) || 0))
    const tf = timingFunction || "ease-out"
    const t = d > 0 ? `transition:transform ${d}ms ${tf};` : "transition:none;"
    const s = `transform:translate3d(0,${yy}px,0);${t}`
    this.setData({ listTransformStyle: s })
  },
  initWorklet() {
    try {
      if (!wx.worklet) return
      if (typeof this.applyAnimatedStyle !== "function") return
      const { shared } = wx.worklet
      if (typeof shared !== "function") return

      const listY = shared(0)
      const overlayY = shared(0)
      const overlayOpacity = shared(0)
      this._workletState = { listY, overlayY, overlayOpacity }

      this._workletEnabled = true
      this.setData({ listTransformStyle: "" })
    } catch (e) {
      this._workletEnabled = false
    }
  },
  waitForReboundToTop(cb) {
    clearTimeout(this._waitTopTimer)
    const startAt = Date.now()
    let stable = 0
    const tick = () => {
      if (this._useScrollViewRefresher) {
        const top = Number(this._scrollTop || 0)
        if (top <= 1) stable += 1
        else stable = 0
        if (stable >= 3) {
          cb && cb()
          return
        }
        if (Date.now() - startAt > 900) {
          cb && cb()
          return
        }
        this._waitTopTimer = setTimeout(tick, 50)
        return
      }
      try {
        const query = wx.createSelectorQuery().in(this)
        query.selectViewport().scrollOffset()
        query.exec((rs) => {
          const off = rs && rs[0]
          const top = off && typeof off.scrollTop === "number" ? off.scrollTop : 0
          if (top <= 1) stable += 1
          else stable = 0
          if (stable >= 3) {
            cb && cb()
            return
          }
          if (Date.now() - startAt > 900) {
            cb && cb()
            return
          }
          this._waitTopTimer = setTimeout(tick, 50)
        })
      } catch (e) {
        cb && cb()
      }
    }
    tick()
  },
  startPrefMoveToTop({ id, finalList }) {
    if (this._workletEnabled) {
      this.startPrefMoveToTopWorklet({ id, finalList })
      return
    }
    this.startPrefMoveToTopLegacy({ id, finalList })
  },
  startPrefMoveToTopWorklet({ id, finalList }) {
    clearTimeout(this._prefMoveTimer)
    clearTimeout(this._prefMoveTimer2)
    const targetId = String(id || "").trim()
    if (!targetId) return
    const item = (finalList || []).find((x) => x && x.id === targetId) || null
    if (!item) return

    const q = wx.createSelectorQuery().in(this)
    q.select("#news-list").boundingClientRect()
    q.select("#news-list .news-card").boundingClientRect()
    q.exec((rects) => {
      const listRect = rects && rects[0]
      const cardRect = rects && rects[1]
      if (!listRect) {
        this.setData({ list: finalList || [], prefMoveOverlay: null })
        return
      }

      const left = Math.round((cardRect && cardRect.left) || (listRect && listRect.left) || 0)
      const width = Math.round((cardRect && cardRect.width) || (listRect && listRect.width) || 0)
      const height = Number((cardRect && cardRect.height) || 0)
      const gapPx = Math.round((Number(this._pxPerRpx) || 0) * 16)
      const pull = Math.max(0, Math.min(220, Math.round(height + gapPx)))
      const gap = Math.max(12, gapPx)
      const destTop = Math.round((listRect && listRect.top) || 0)

      const style = `left:${left}px;top:${destTop}px;width:${width}px;`
      this.setData({ prefMoveOverlay: { show: true, item, style } }, () => {
        const st = this._workletState
        if (!st || !wx.worklet || !wx.worklet.runOnUI) {
          this.setData({ list: finalList || [], prefMoveOverlay: null })
          return
        }
        if (typeof this.applyAnimatedStyle === "function" && !this._workletStylesApplied) {
          this._workletStylesApplied = true
          wx.nextTick(() => {
            try {
              const listY = st.listY
              this.applyAnimatedStyle("#news-list", () => {
                "worklet"
                return { transform: `translateY(${listY.value}px)` }
              })
            } catch (e) {}
            try {
              const overlayY = st.overlayY
              const overlayOpacity = st.overlayOpacity
              this.applyAnimatedStyle("#pref-move-overlay", () => {
                "worklet"
                return {
                  opacity: overlayOpacity.value,
                  transform: `translateY(${overlayY.value}px)`
                }
              })
            } catch (e) {}
          })
        }

        try {
          const { runOnUI, timing, sequence, delay, Easing } = wx.worklet
          const listY = st.listY
          const overlayY = st.overlayY
          const overlayOpacity = st.overlayOpacity
          runOnUI(() => {
            "worklet"
            const ease = Easing && Easing.ease ? Easing.ease : undefined
            overlayOpacity.value = 1
            overlayY.value = pull + gap
            listY.value = 0
            overlayY.value = timing(0, { duration: 520, easing: ease })
            listY.value = sequence(
              timing(pull, { duration: 220, easing: ease }),
              delay(340, timing(0, { duration: 260, easing: ease }))
            )
          })()
        } catch (e) {}

        clearTimeout(this._prefMoveTimer)
        this._prefMoveTimer = setTimeout(() => {
          const hiddenList = (finalList || []).map((x, idx) => {
            if (!x || !x.id) return x
            if (idx !== 0) return x
            return { ...x, _prefMoveHidden: true }
          })
          this.setData({ list: hiddenList })
        }, 260)

        clearTimeout(this._prefMoveTimer2)
        this._prefMoveTimer2 = setTimeout(() => {
          const unhidden = (finalList || []).map((x) => {
            if (!x || !x.id) return x
            if (!x._prefMoveHidden) return x
            const { _prefMoveHidden, ...rest } = x
            return rest
          })
          this.setData({ list: unhidden, prefMoveOverlay: null }, () => {
            try {
              const { runOnUI } = wx.worklet
              const listY = st.listY
              const overlayY = st.overlayY
              const overlayOpacity = st.overlayOpacity
              runOnUI(() => {
                "worklet"
                overlayOpacity.value = 0
                overlayY.value = 0
                listY.value = 0
              })()
            } catch (e) {}
            if (typeof this.clearAnimatedStyle === "function") {
              try {
                this.clearAnimatedStyle("#news-list")
              } catch (e) {}
              try {
                this.clearAnimatedStyle("#pref-move-overlay")
              } catch (e) {}
              this._workletStylesApplied = false
            }

            clearTimeout(this._prefPromotedTimer)
            this._prefPromotedTimer = setTimeout(() => {
              const cleared = (this.data.list || []).map((x) => {
                if (!x || !x.id) return x
                if (!x._prefPromoted) return x
                return { ...x, _prefPromoted: false }
              })
              this.setData({ list: cleared })
            }, 650)
          })
        }, 820)
      })
    })
  },
  startPrefMoveToTopLegacy({ id, finalList }) {
    clearTimeout(this._prefMoveTimer)
    clearTimeout(this._prefMoveTimer2)
    const targetId = String(id || "").trim()
    if (!targetId) return
    const item = (finalList || []).find((x) => x && x.id === targetId) || null
    if (!item) return

    const q = wx.createSelectorQuery().in(this)
    q.select(".news-list").boundingClientRect()
    q.select(".news-list .news-card").boundingClientRect()
    q.exec((rects) => {
      const listRect = rects && rects[0]
      const cardRect = rects && rects[1]
      if (!listRect || !cardRect) {
        this.setData({ list: finalList, prefMoveOverlay: null })
        return
      }

      const left = Number(cardRect.left) || 0
      const width = Number(cardRect.width) || 0
      const height = Number(cardRect.height) || 0
      const gapPx = Math.round((Number(this._pxPerRpx) || 0) * 16)
      const pull = Math.max(0, Math.min(220, Math.round(height + gapPx)))
      const destTop = Number(listRect.top) || Number(cardRect.top) || 0
      const gap = Math.max(12, gapPx)
      const startTop = destTop + pull + gap
      const deltaY = -(pull + gap)

      const initialStyle = `left:${left}px;top:${startTop}px;width:${width}px;transform:translate3d(0,0,0);transition:none;`
      this.setData({ prefMoveOverlay: { show: true, item, style: initialStyle } }, () => {
        wx.nextTick(() => {
          this.setListOffset(pull, 220, "ease-out")
          const movingStyle = `left:${left}px;top:${startTop}px;width:${width}px;transform:translate3d(0,${deltaY}px,0);transition:transform 520ms cubic-bezier(0.22, 1, 0.36, 1);`
          this.setData({ prefMoveOverlay: { show: true, item, style: movingStyle } })
        })

        this._prefMoveTimer = setTimeout(() => {
          const hiddenList = (finalList || []).map((x, idx) => {
            if (!x || !x.id) return x
            if (idx !== 0) return x
            return { ...x, _prefMoveHidden: true }
          })
          this.setData({ list: hiddenList })
          this._prefMoveTimer2 = setTimeout(() => {
            this.setListOffset(0, 260, "ease-out")
          }, 30)
        }, 260)

        this._prefMoveTimer2 = setTimeout(() => {
          const unhidden = (this.data.list || []).map((x) => {
            if (!x || !x.id) return x
            if (!x._prefMoveHidden) return x
            const { _prefMoveHidden, ...rest } = x
            return rest
          })
          this.setData({ list: unhidden, prefMoveOverlay: null }, () => {
            clearTimeout(this._prefPromotedTimer)
            this._prefPromotedTimer = setTimeout(() => {
              const cleared = (this.data.list || []).map((x) => {
                if (!x || !x.id) return x
                if (!x._prefPromoted) return x
                return { ...x, _prefPromoted: false }
              })
              this.setData({ list: cleared })
            }, 650)
          })
        }, 820)
      })
    })
  },
  onReachBottom() {
    if (this.data.loading) return
    if (!this.data.hasMore) {
      wx.showToast({ title: "已到底", icon: "none" })
      return
    }
    const nextPage = Number(this.data.page || 1) + 1
    this.reload({ reset: false, page: nextPage })
  },
  onTapCard(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/news-detail/index?id=${encodeURIComponent(id)}` })
  },
  onCloseWelcome() {
    this.setData({ showWelcome: false }, () => {
      if (typeof this.getTabBar === "function") {
        const tb = this.getTabBar()
        if (tb && typeof tb.setVisible === "function") {
          tb.setVisible(true)
        }
      }
    })
  },
  noop() {}
})
