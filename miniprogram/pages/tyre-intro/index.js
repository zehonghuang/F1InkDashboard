const i18n = require("../../services/i18n")

const TYRE_PRESETS = [
  {
    key: "slick_red",
    file: "red.png",
    theme: "#ff4d57",
    glow: "rgba(255, 77, 87, 0.34)",
    darkGlow: "rgba(88, 16, 20, 0.96)",
    ring: "rgba(255, 77, 87, 0.18)",
    category: "slick",
    metrics: { grip: 96, durability: 52, warmup: 92 }
  },
  {
    key: "slick_yellow",
    file: "yellow.png",
    theme: "#ffd84d",
    glow: "rgba(255, 216, 77, 0.30)",
    darkGlow: "rgba(85, 64, 8, 0.96)",
    ring: "rgba(255, 216, 77, 0.16)",
    category: "slick",
    metrics: { grip: 82, durability: 74, warmup: 72 }
  },
  {
    key: "slick_white",
    file: "white.png",
    theme: "#f3f5f8",
    glow: "rgba(243, 245, 248, 0.20)",
    darkGlow: "rgba(64, 70, 82, 0.96)",
    ring: "rgba(243, 245, 248, 0.14)",
    category: "slick",
    metrics: { grip: 68, durability: 93, warmup: 56 }
  },
  {
    key: "wet_green",
    file: "green.png",
    theme: "#42d97a",
    glow: "rgba(66, 217, 122, 0.28)",
    darkGlow: "rgba(10, 68, 32, 0.96)",
    ring: "rgba(66, 217, 122, 0.18)",
    category: "wet",
    metrics: { grip: 72, durability: 70, warmup: 66 }
  },
  {
    key: "wet_blue",
    file: "blue.png",
    theme: "#52a8ff",
    glow: "rgba(82, 168, 255, 0.28)",
    darkGlow: "rgba(10, 36, 78, 0.96)",
    ring: "rgba(82, 168, 255, 0.18)",
    category: "wet",
    metrics: { grip: 64, durability: 62, warmup: 78 }
  }
]

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "")
  const p = String(path || "")
  if (!p) return ""
  if (/^https?:\/\//i.test(p)) return p
  if (!b) return p
  return `${b}${p.startsWith("/") ? p : `/${p}`}`
}

function buildTyres() {
  const base = (() => {
    try {
      const app = getApp()
      return app && app.globalData && app.globalData.apiBase ? String(app.globalData.apiBase || "") : ""
    } catch (e) {
      return ""
    }
  })()
  return TYRE_PRESETS.map((item) => ({
    ...item,
    imageUrl: joinUrl(base, `/static/assets/tyres/pirelli/${item.file}`),
    displayImageUrl: joinUrl(base, `/static/assets/tyres/pirelli/${item.file}`),
    gaugeTrackStyle: `background: linear-gradient(90deg, ${item.ring} 0%, rgba(255,255,255,0.06) 100%);`,
    glowStyle: `background: radial-gradient(circle at center, ${item.glow} 0%, rgba(0,0,0,0) 68%);`
  }))
}

function getTyreCopy(key) {
  const t = (name) => i18n.t(`tyreIntro.${name}`)
  const map = {
    slick_red: {
      name: t("redName"),
      shortName: t("redShort"),
      summary: t("redSummary"),
      bestFor: t("redBestFor"),
      usage: t("redUsage"),
      note: t("redNote")
    },
    slick_yellow: {
      name: t("yellowName"),
      shortName: t("yellowShort"),
      summary: t("yellowSummary"),
      bestFor: t("yellowBestFor"),
      usage: t("yellowUsage"),
      note: t("yellowNote")
    },
    slick_white: {
      name: t("whiteName"),
      shortName: t("whiteShort"),
      summary: t("whiteSummary"),
      bestFor: t("whiteBestFor"),
      usage: t("whiteUsage"),
      note: t("whiteNote")
    },
    wet_green: {
      name: t("greenName"),
      shortName: t("greenShort"),
      summary: t("greenSummary"),
      bestFor: t("greenBestFor"),
      usage: t("greenUsage"),
      note: t("greenNote")
    },
    wet_blue: {
      name: t("blueName"),
      shortName: t("blueShort"),
      summary: t("blueSummary"),
      bestFor: t("blueBestFor"),
      usage: t("blueUsage"),
      note: t("blueNote")
    }
  }
  return map[key] || map.slick_red
}

function enrichTyres(list) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const copy = getTyreCopy(item.key)
    return {
      ...item,
      displayName: copy.name,
      shortName: copy.shortName,
      summary: copy.summary,
      bestFor: copy.bestFor,
      usage: copy.usage,
      note: copy.note,
      categoryLabel: item.category === "wet" ? i18n.t("tyreIntro.wetLabel") : i18n.t("tyreIntro.slickLabel"),
      gripStyle: `width:${item.metrics.grip}%; background:${item.theme};`,
      durabilityStyle: `width:${item.metrics.durability}%; background:${item.theme};`,
      warmupStyle: `width:${item.metrics.warmup}%; background:${item.theme};`,
      chipStyle: `border-color:${item.ring}; background:${item.glow}; color:${item.theme};`,
      activeChipStyle: `border-color:${item.theme}; background:${item.glow}; color:#ffffff; box-shadow: 0 0 28rpx ${item.glow};`,
      railStyle: `background: linear-gradient(90deg, ${item.theme} 0%, ${item.glow} 46%, rgba(255,255,255,0.06) 100%);`,
      sectionStyle: `background: linear-gradient(180deg, rgba(12, 14, 20, 0.94) 0%, ${item.darkGlow} 100%);`
    }
  })
}

Page({
  data: {
    i18n: i18n.getDict(),
    locale: i18n.getLocale(),
    tyres: [],
    activeIndex: 0,
    activeTyre: null,
    pageStyle: "",
    heroImageError: false
  },
  onLoad(options) {
    const rawIndex = Number(options && options.index)
    this._offLocale = i18n.onLocaleChange(() => this.applyI18n(this.data.activeIndex))
    this.applyI18n(Number.isFinite(rawIndex) ? rawIndex : 0)
  },
  onUnload() {
    if (this._offLocale) this._offLocale()
  },
  onShow() {
    this.applyI18n(this.data.activeIndex)
  },
  applyI18n(index) {
    const tyres = enrichTyres(buildTyres())
    const max = tyres.length ? tyres.length - 1 : 0
    const nextIndex = Math.max(0, Math.min(Number(index) || 0, max))
    const activeTyre = tyres[nextIndex] || null
    this.setData({
      i18n: i18n.getDict(),
      locale: i18n.getLocale(),
      tyres,
      activeIndex: nextIndex,
      activeTyre,
      pageStyle: this.buildPageStyle(activeTyre),
      heroImageError: false
    })
    try {
      wx.setNavigationBarTitle({ title: i18n.t("tyreIntro.pageTitle") })
    } catch (e) {}
  },
  buildPageStyle(tyre) {
    if (!tyre) return ""
    return [
      "background:",
      `radial-gradient(circle at 50% -6%, ${tyre.glow} 0%, rgba(0,0,0,0) 34%),`,
      `radial-gradient(circle at 10% 18%, ${tyre.ring} 0%, rgba(0,0,0,0) 32%),`,
      "linear-gradient(180deg, #090b10 0%, #0e1219 42%, #07080d 100%);"
    ].join(" ")
  },
  onSelectTyre(e) {
    const index = e && e.currentTarget && e.currentTarget.dataset ? Number(e.currentTarget.dataset.index) : 0
    this.switchTyre(index)
  },
  onImageLoad(e) {
    this.setData({ heroImageError: false })
  },
  onImageError(e) {
    this.setData({ heroImageError: true })
  },
  switchTyre(index) {
    const tyres = Array.isArray(this.data.tyres) ? this.data.tyres : []
    if (!tyres.length) return
    const nextIndex = Math.max(0, Math.min(Number(index) || 0, tyres.length - 1))
    const activeTyre = tyres[nextIndex]
    this.setData({
      activeIndex: nextIndex,
      activeTyre,
      pageStyle: this.buildPageStyle(activeTyre),
      heroImageError: false
    })
  }
})
