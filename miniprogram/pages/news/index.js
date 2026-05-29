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

function shouldEnablePrefPromoteDemo() {
  try {
    return String(wx.getStorageSync("news_demo_pref_promote") || "") === "1"
  } catch (e) {
    return false
  }
}

function buildDemoNewsItems(prefs) {
  const inited = (() => {
    try {
      return Boolean(wx.getStorageSync(PREFS_INITED_KEY))
    } catch (e) {
      return false
    }
  })()
  if (!inited) return []
  const teams = Array.isArray(prefs && prefs.followTeams) ? prefs.followTeams : []
  const drivers = Array.isArray(prefs && prefs.followDrivers) ? prefs.followDrivers : []
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
    statusBarHeight: 0
  },
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync()
      const h = Number(sys && sys.statusBarHeight) || 0
      this.setData({ statusBarHeight: h })
    } catch (e) {}
    this.reload()
  },
  onUnload() {
    clearTimeout(this._prefPromotedTimer)
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
  onPullDownRefresh() {
    this.reload({ stopRefresh: true, reset: true, softReset: true })
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
        wx.stopPullDownRefresh()
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
          if (softReset && Array.isArray(prevList) && prevList.length) {
            const prefs = getLocalPrefs()
            let restWithDemo = rest
            if (shouldEnablePrefPromoteDemo()) {
              const demo = buildDemoNewsItems(prefs)
              const seen = new Set(rest.map((x) => (x && x.id ? x.id : "")).filter(Boolean))
              const inject = demo.filter((x) => x && x.id && !seen.has(x.id))
              restWithDemo = inject.length ? [...inject, ...rest] : rest
            }
            const promoted = promoteNewHitItems({ prevList, nextList: restWithDemo, prefs })
            nextList = promoted.list
            promotedIds = promoted.promotedIds
            if (promotedIds.length) {
              nextList = nextList.map((x) => {
                if (!x || !x.id) return x
                if (!promotedIds.includes(x.id)) return x
                return { ...x, _prefPromoted: true }
              })
            }
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
            if (promotedIds && promotedIds.length) {
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
            done()
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
