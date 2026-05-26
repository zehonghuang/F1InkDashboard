function formatRelativeTime(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const delta = Date.now() - t
  if (delta < 60 * 1000) return "刚刚"
  if (delta < 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / (60 * 1000)))} 分钟前`
  if (delta < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / (60 * 60 * 1000)))} 小时前`
  if (delta < 7 * 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / (24 * 60 * 60 * 1000)))} 天前`
  const d = new Date(t)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}.${m}.${day}`
}

const LAYOUT_CODE = {
  BREAKING: "BREAKING",
  HERO: "HERO",
  FEATURE: "FEATURE",
  STANDARD: "STANDARD",
  BULLETIN: "BULLETIN"
}

const HERO_DISPLAY_CODE = {
  BANNER: "BANNER",
  CARD: "CARD"
}

const TYPE_CODE = {
  REGULATION: "REGULATION",
  PADDOCK: "PADDOCK",
  STRATEGY: "STRATEGY",
  DRIVER: "DRIVER",
  TECH: "TECH"
}

const MOCK_NEWS = [
  {
    id: "n_20260526_breaking_winner",
    layoutCode: LAYOUT_CODE.BREAKING,
    pinned: true,
    weight: 1200,
    typeCode: TYPE_CODE.PADDOCK,
    tagText: "Breaking",
    title: "Breaking：赛后速报",
    summary: "欢迎页占位：后续可用于赛后热点图与一句话摘要。",
    coverUrl: "/assets/images/breaking-new-01.jpg",
    publishedAt: "2026-05-26T09:15:00+08:00",
    source: { name: "Race Control", url: "" },
    content: { formatCode: "PLAIN", text: "Breaking 占位正文。" }
  },
  {
    id: "n_20260526_hero_rules",
    layoutCode: LAYOUT_CODE.HERO,
    heroDisplayCode: HERO_DISPLAY_CODE.BANNER,
    pinned: true,
    weight: 980,
    typeCode: TYPE_CODE.REGULATION,
    tagText: "FIA / 规则",
    title: "2026 赛季新规要点速览：动力单元与空气动力学方向",
    summary: "整理动力单元、电能占比、DRS 变化等核心信息，方便快速了解新规影响。",
    coverUrl: "/assets/circuits/2026/raw/shanghai_map.webp",
    publishedAt: "2026-05-26T08:40:00+08:00",
    source: { name: "FIA", url: "" },
    content: {
      formatCode: "PLAIN",
      text:
        "这里先做占位。后续接入接口后，可以把正文以富文本（rich-text）或 WebView 阅读原文的方式展示。"
    }
  },
  {
    id: "n_20260526_hero_paddock",
    layoutCode: LAYOUT_CODE.HERO,
    heroDisplayCode: HERO_DISPLAY_CODE.BANNER,
    pinned: false,
    weight: 900,
    typeCode: TYPE_CODE.PADDOCK,
    tagText: "围场动态",
    title: "本周末焦点事件追踪：升级、处罚与关键发车位变动",
    summary: "将练习赛后信息按“升级/处罚/排位节奏”聚合，便于快速抓住关注点。",
    coverUrl: "/assets/circuits/2026/raw/monaco_map.webp",
    publishedAt: "2026-05-26T07:50:00+08:00",
    source: { name: "Paddock", url: "" },
    content: { formatCode: "PLAIN", text: "这里先做占位。后续可接入聚合资讯正文。" }
  },
  {
    id: "n_20260526_feat_upgrades",
    layoutCode: LAYOUT_CODE.FEATURE,
    pinned: false,
    weight: 820,
    typeCode: TYPE_CODE.TECH,
    tagText: "围场动态",
    title: "车队升级进度跟踪：本周末主要部件更新清单",
    summary: "按车队梳理前翼、底板、散热与尾翼变化，并标注升级意图与风险点。",
    coverUrl: "/assets/circuits/2026/raw/miami_map.webp",
    publishedAt: "2026-05-26T06:20:00+08:00",
    source: { name: "Paddock", url: "" },
    content: {
      formatCode: "PLAIN",
      text: "这里先做占位。后续正文可从后端聚合并缓存。"
    }
  },
  {
    id: "n_20260525_feat_strategy",
    layoutCode: LAYOUT_CODE.FEATURE,
    pinned: false,
    weight: 760,
    typeCode: TYPE_CODE.STRATEGY,
    tagText: "赛道 / 轮胎",
    title: "本站轮胎策略前瞻：长距离衰减与进站窗口推演",
    summary: "结合练习赛长距离与历史数据，给出 1/2 停策略对比与关键触发条件。",
    coverUrl: "/assets/circuits/2026/raw/monaco_map.webp",
    publishedAt: "2026-05-25T21:10:00+08:00",
    source: { name: "Strategy Desk", url: "" },
    content: {
      formatCode: "PLAIN",
      text: "这里先做占位。后续可以加入策略图表与关键段落高亮。"
    }
  },
  {
    id: "n_20260525_std_driver",
    layoutCode: LAYOUT_CODE.STANDARD,
    pinned: false,
    weight: 620,
    typeCode: TYPE_CODE.DRIVER,
    tagText: "人物",
    title: "车手专访节选：如何在高温下保持轮胎温度窗口",
    summary: "从驾驶风格、刹车点与能量回收入手，拆解“保胎”的具体操作。",
    coverUrl: "/assets/circuits/2026/raw/suzuka_map.webp",
    publishedAt: "2026-05-25T11:35:00+08:00",
    source: { name: "Interview", url: "" },
    content: {
      formatCode: "PLAIN",
      text: "这里先做占位。后续可以支持分段引用、收藏与分享。"
    }
  },
  {
    id: "n_20260526_bullet_1",
    layoutCode: LAYOUT_CODE.BULLETIN,
    pinned: false,
    weight: 540,
    typeCode: TYPE_CODE.PADDOCK,
    tagText: "快讯",
    title: "练习赛出现红旗，赛会通报清理时间约 12 分钟",
    summary: "快讯占位：后续可用于高频小消息的行式布局。",
    coverUrl: "",
    publishedAt: "2026-05-26T09:05:00+08:00",
    source: { name: "Race Control", url: "" },
    content: { formatCode: "PLAIN", text: "快讯占位正文。" }
  },
  {
    id: "n_20260526_bullet_2",
    layoutCode: LAYOUT_CODE.BULLETIN,
    pinned: false,
    weight: 520,
    typeCode: TYPE_CODE.PADDOCK,
    tagText: "快讯",
    title: "赛会更新：部分弯道限界点位将加强监控",
    summary: "快讯占位：后续可用于处罚/公告/赛会通告等短内容。",
    coverUrl: "",
    publishedAt: "2026-05-26T08:55:00+08:00",
    source: { name: "Stewards", url: "" },
    content: { formatCode: "PLAIN", text: "快讯占位正文。" }
  }
]

function sortNews(list) {
  return [...list].sort((a, b) => {
    const ap = a && a.pinned ? 1 : 0
    const bp = b && b.pinned ? 1 : 0
    if (bp !== ap) return bp - ap
    const aw = Number(a && a.weight) || 0
    const bw = Number(b && b.weight) || 0
    if (bw !== aw) return bw - aw
    const at = Date.parse((a && a.publishedAt) || "") || 0
    const bt = Date.parse((b && b.publishedAt) || "") || 0
    return bt - at
  })
}

function mapForList(item) {
  return {
    id: item.id,
    layoutCode: item.layoutCode,
    heroDisplayCode:
      item.layoutCode === LAYOUT_CODE.HERO ? item.heroDisplayCode || HERO_DISPLAY_CODE.CARD : "",
    typeCode: item.typeCode,
    pinned: Boolean(item.pinned),
    weight: Number(item.weight) || 0,
    tagText: item.tagText || "",
    title: item.title || "",
    summary: item.summary || "",
    coverUrl: item.coverUrl || "",
    publishedAt: item.publishedAt || "",
    timeText: formatRelativeTime(item.publishedAt || "")
  }
}

function getMockNewsList() {
  return sortNews(MOCK_NEWS).map(mapForList)
}

function getMockNewsById(id) {
  const found = MOCK_NEWS.find((x) => x.id === id) || null
  if (!found) return null
  return {
    ...mapForList(found),
    source: found.source || null,
    content: found.content || { formatCode: "PLAIN", text: "" }
  }
}

module.exports = {
  LAYOUT_CODE,
  HERO_DISPLAY_CODE,
  TYPE_CODE,
  getMockNewsList,
  getMockNewsById
}
