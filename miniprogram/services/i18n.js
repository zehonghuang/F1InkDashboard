const STORAGE_KEY = "locale"

const SUPPORTED = ["zh-CN", "en-US"]

const ZH_CN = {
  locale: {
    name: "简体中文",
    zhName: "简体中文",
    enName: "English",
    switchToZh: "切换为中文",
    switchToEn: "切换为英文",
    switched: "语言已切换"
  },
  common: {
    ok: "确定",
    cancel: "取消",
    loading: "加载中...",
    featurePending: "功能待接入",
    loginFirst: "请先登录",
    loginSuccess: "登录成功",
    loginFailed: "登录失败:{msg}",
    logoutSuccess: "已退出",
    copied: "已复制",
    copyFailed: "复制失败",
    noLinkToCopy: "暂无可复制链接",
    avatarUpdated: "头像已更新",
    avatarUploadFailed: "头像上传失败:{msg}",
    nicknameUpdated: "昵称已更新",
    nicknameSyncFailed: "昵称同步失败",
    prefsSyncFailed: "偏好同步失败",
    prefsSaveFailed: "偏好保存失败",
    backendNotConfigured: "未配置后端地址",
    noSeasonData: "暂无可用赛季数据",
    fetchSeasonFailed: "获取赛季信息失败",
    fetchDriverListFailed: "获取车手列表失败",
    bindDeviceTitle: "绑定设备",
    bindDevicePlaceholder: "输入设备ID（12位）",
    bound: "已绑定",
    bindFailed: "绑定失败",
    comingSoon: "敬请期待"
  },
  nav: {
    appTitle: "TONIC F1 数据分析",
    news: "资讯",
    archive: "归档",
    mine: "我的",
    standings: "赛季积分",
    sessions: "赛程",
    results: "成绩",
    compare: "对比"
  },
  entry: {
    loading: "加载中..."
  },
  news: {
    pageTitle: "F1 资讯",
    welcomeEnter: "点击进入",
    empty: "暂无资讯",
    loadFailedRetry: "加载失败，请下拉重试",
    noMore: "已到底",
    startsInSuffix: "将始于",
    sessionFP1: "练习赛一",
    sessionFP2: "练习赛二",
    sessionFP3: "练习赛三",
    sessionSQ: "冲刺赛排位赛",
    sessionSprint: "冲刺赛",
    sessionQ: "排位赛",
    sessionRace: "正赛",
    unitDay: "天",
    unitHrs: "时",
    unitMin: "分",
    unitSec: "秒"
  },
  newsDetail: {
    title: "资讯详情",
    loading: "加载中...",
    missingId: "缺少资讯 ID",
    loadFailed: "加载失败",
    expand: "展开"
  },
  archive: {
    headerTitle: "F1 数据分析",
    winner: "分站冠军：",
    fastestLap: "正赛最快圈：",
    seasonSuffix: "赛季",
    searchPrefix: "检索: ",
    searchPlaceholder: "请输入赛道或日期",
    pending: "待更新"
  },
  compare: {
    title: "⚖️ 全局性能对比",
    subtitle: "跨分站/多车手脚法对齐",
    sectionDimension: "对比维度",
    byTrack: "按赛道",
    byTrackDesc: "同一赛道不同赛季/车手对齐",
    byDate: "按日期",
    byDateDesc: "按周末日期快速回看",
    byDriver: "按车手",
    byDriverDesc: "对比驾驶风格/刹车点",
    sectionHint: "提示",
    hintText: "当前仅搭好 UI 框架与入口，后续接入后端数据后即可展示图表与 KPI。",
    startCompare: "开始对比",
    toastComingSoon: "对比功能待接入"
  },
  raceSessions: {
    title: "周末赛程",
    chooseSession: "选择场次",
    subtitle: "{season} 赛季 · 第 {round} 站",
    sectionSessions: "场次",
    statusDone: "已结束",
    statusLive: "进行中",
    statusUpcoming: "未开始",
    liveNeedLoginTitle: "需要登录",
    liveNeedLoginText: "登录后即可查看实时直播数据",
    liveGoLogin: "去登录"
  },
  sessionResults: {
    title: "场次成绩",
    needLogin: "需要登录",
    loginToCompare: "登录后才可以选择车手进行对比",
    goLogin: "去登录",
    pickDriver: "请选择车手",
    comparePrefix: "对比：",
    fastestLap: "最快圈",
    fastestLapCompare: "最快圈对比",
    tabRank: "排名",
    tabBoxplot: "箱线图",
    tabThrottle: "油门比",
    tabBrake: "刹车比",
    tabSpeed: "速度",
    telemetrySummary: "遥测摘要",
    telemetryInsight: "关键观察",
    telemetrySectorPeak: "最高均值",
    telemetryMetricThrottle: "平均油门",
    telemetryMetricBrake: "平均刹车",
    telemetryMetricSpeed: "平均速度",
    telemetryLargestGap: "最大差距",
    telemetryLapDelta: "圈速差",
    chartGuideTitle: "图表提示",
    chartGuideGesture: "左右滑动可切换图表",
    chartGuideDivider: "·",
    chartGuideBoxplot: "中位数越低越快，箱体越短越稳定",
    chartGuideTelemetry: "横轴为赛道分段位置，纵轴为当前图表指标",
    boxplotSummary: "比赛节奏分布",
    boxplotSummaryDesc: "中位数越低越快，箱体越短越稳定",
    boxplotFastestPace: "最快中位圈速",
    boxplotMostStable: "最稳定车手",
    boxplotLargestSpread: "波动最大",
    boxplotPaceFloor: "节奏下沿",
    boxplotMedianPace: "中位圈速",
    boxplotTypicalRange: "常规区间",
    boxplotOverallSpread: "整体波动",
    boxLowerWhisker: "下须",
    boxQ1: "Q1",
    boxMedian: "中位数",
    boxQ3: "Q3",
    boxUpperWhisker: "上须"
  },
  driver: {
    fastestLap: "最快圈",
    throttleBrake: "油门 / 刹车 (%)",
    throttle: "油门",
    brake: "刹车",
    speed: "速度"
  },
  mine: {
    title: "我的",
    guestName: "游客",
    notSet: "未设置",
    peopleUnit: " 人",
    teamsUnit: " 支",
    loggedIn: "已登录",
    guest: "游客浏览中（登录可同步设置）",
    nickPlaceholder: "请输入昵称",
    wechatLogin: "微信登录",
    bindDevice: "绑定设备",
    followDrivers: "关注车手",
    followTeams: "关注车队",
    currentDeviceId: "当前设备ID",
    fanProfile: "我的 F1 档案",
    fanIdentity: "赛季身份",
    supportSummary: "关注摘要",
    followOverview: "关注摘要",
    myDriver: "My Driver",
    myTeam: "My Team",
    noDriverYet: "还没有关注车手",
    noTeamYet: "还没有关注车队",
    followToBuild: "去选择你的关注对象",
    seasonSummary: "本赛季关注",
    seasonSummaryHint: "你的关注会影响资讯排序与偏好推荐",
    profileGuideTitle: "完善资料 {done}/{total}",
    profileGuideHint: "补齐头像和昵称后，你的个人资料会更完整。",
    profileGuideAvatar: "上传头像",
    profileGuideAvatarHint: "点击左侧头像即可完成这一步",
    profileGuideNickname: "设置昵称",
    profileGuideNicknameHint: "补一个你想展示的昵称",
    profileGuideDone: "已完成",
    profileGuideDoneHint: "这一项已经准备好了",
    profileGuideTodo: "待完成",
    quickActions: "快捷入口",
    preferences: "偏好与设置",
    syncHint: "登录后可同步头像、昵称和关注列表",
    comingNext: "Coming next",
    more: "更多功能",
    standings: "赛季积分",
    shop: "商店",
    shopHint: "去围场逛点有意思的",
    coverUpload: "上传背景",
    coverReplace: "更换背景",
    coverRemove: "移除背景",
    coverCropTitle: "裁剪背景",
    coverCropHint: "按名片外框比例裁剪，拖动画面并缩放取景",
    coverCropZoom: "缩放",
    coverCropReset: "重置",
    coverCropUse: "使用图片",
    coverPullIdle: "下拉更换背景",
    coverPullReady: "松手更换背景",
    coverUpdated: "背景已更新",
    coverRemoved: "背景已移除",
    coverUploadFailed: "背景上传失败",
    logout: "退出登录",
    language: "语言"
  },
  shop: {
    title: "商店",
    pageTitle: "商店",
    detailTitle: "商品详情",
    price: "价格",
    buy: "购买",
    empty: "暂无商品",
    uiOnly: "仅 UI，无后端"
  },
  standings: {
    title: "赛季积分",
    pageTitle: "赛季排名",
    subtitle: "{season} 年度积分榜",
    updatedAtUTC: "数据更新时间(UTC)：{ts}",
    noData: "暂无可用赛季排名数据",
    loadFailed: "排名加载失败",
    drivers: "车手榜",
    teams: "车队榜"
  },
  relativeTime: {
    justNow: "刚刚",
    minutesAgo: "{n}分钟前",
    hoursAgo: "{n}小时前",
    daysAgo: "{n}天前"
  }
}

const EN_US = {
  locale: {
    name: "English",
    zhName: "简体中文",
    enName: "English",
    switchToZh: "Switch to Chinese",
    switchToEn: "Switch to English",
    switched: "Language switched"
  },
  common: {
    ok: "OK",
    cancel: "Cancel",
    loading: "Loading...",
    featurePending: "Not available yet",
    loginFirst: "Please login first",
    loginSuccess: "Login success",
    loginFailed: "Login failed: {msg}",
    logoutSuccess: "Logged out",
    copied: "Copied",
    copyFailed: "Copy failed",
    noLinkToCopy: "No link to copy",
    avatarUpdated: "Avatar updated",
    avatarUploadFailed: "Avatar upload failed: {msg}",
    nicknameUpdated: "Nickname updated",
    nicknameSyncFailed: "Nickname sync failed",
    prefsSyncFailed: "Preferences sync failed",
    prefsSaveFailed: "Preferences save failed",
    backendNotConfigured: "Backend base URL not configured",
    noSeasonData: "No season data available",
    fetchSeasonFailed: "Failed to fetch season info",
    fetchDriverListFailed: "Failed to fetch driver list",
    bindDeviceTitle: "Bind Device",
    bindDevicePlaceholder: "Enter device ID (12 chars)",
    bound: "Bound",
    bindFailed: "Bind failed",
    comingSoon: "Coming soon"
  },
  nav: {
    appTitle: "TONIC F1 Analytics",
    news: "News",
    archive: "Archive",
    mine: "Me",
    standings: "Standings",
    sessions: "Sessions",
    results: "Results",
    compare: "Compare"
  },
  entry: {
    loading: "Loading..."
  },
  news: {
    pageTitle: "F1 News",
    welcomeEnter: "Tap to enter",
    empty: "No news",
    loadFailedRetry: "Load failed. Pull down to retry.",
    noMore: "No more",
    startsInSuffix: "starts in",
    sessionFP1: "FP1",
    sessionFP2: "FP2",
    sessionFP3: "FP3",
    sessionSQ: "Sprint Qualifying",
    sessionSprint: "Sprint",
    sessionQ: "Qualifying",
    sessionRace: "Race",
    unitDay: "D",
    unitHrs: "H",
    unitMin: "M",
    unitSec: "S"
  },
  newsDetail: {
    title: "News",
    loading: "Loading...",
    missingId: "Missing news id",
    loadFailed: "Load failed",
    expand: "Open"
  },
  archive: {
    headerTitle: "F1 Analytics",
    winner: "Winner: ",
    fastestLap: "Fastest lap: ",
    seasonSuffix: "Season",
    searchPrefix: "Search: ",
    searchPlaceholder: "Enter track or date",
    pending: "TBD"
  },
  compare: {
    title: "⚖️ Performance Compare",
    subtitle: "Cross-race & multi-driver alignment",
    sectionDimension: "Compare by",
    byTrack: "Track",
    byTrackDesc: "Same track across seasons/drivers",
    byDate: "Date",
    byDateDesc: "Quick weekend recap",
    byDriver: "Driver",
    byDriverDesc: "Driving style / braking points",
    sectionHint: "Hint",
    hintText: "UI scaffold only. Charts & KPIs will be available after backend integration.",
    startCompare: "Start",
    toastComingSoon: "Compare is not available yet"
  },
  raceSessions: {
    title: "Weekend Sessions",
    chooseSession: "Choose session",
    subtitle: "{season} Season · Round {round}",
    sectionSessions: "Sessions",
    statusDone: "Finished",
    statusLive: "Live",
    statusUpcoming: "Upcoming",
    liveNeedLoginTitle: "Login required",
    liveNeedLoginText: "Login to view live timing data",
    liveGoLogin: "Login"
  },
  sessionResults: {
    title: "Session Results",
    needLogin: "Login required",
    loginToCompare: "Login to compare drivers",
    goLogin: "Login",
    pickDriver: "Select a driver",
    comparePrefix: "Compare: ",
    fastestLap: "Fastest lap",
    fastestLapCompare: "Fastest lap compare",
    tabRank: "Rank",
    tabBoxplot: "Box plot",
    tabThrottle: "Throttle",
    tabBrake: "Brake",
    tabSpeed: "Speed",
    telemetrySummary: "Telemetry Summary",
    telemetryInsight: "Key insight",
    telemetrySectorPeak: "Highest avg",
    telemetryMetricThrottle: "Avg throttle",
    telemetryMetricBrake: "Avg brake",
    telemetryMetricSpeed: "Avg speed",
    telemetryLargestGap: "Largest gap",
    telemetryLapDelta: "Lap delta",
    chartGuideTitle: "Chart Tips",
    chartGuideGesture: "Swipe left or right to switch charts",
    chartGuideDivider: "·",
    chartGuideBoxplot: "Lower medians are quicker, and shorter boxes mean better consistency",
    chartGuideTelemetry: "The X-axis shows track sectors, and the Y-axis shows the current chart metric",
    boxplotSummary: "Race Pace",
    boxplotSummaryDesc: "Lower median is quicker, shorter boxes mean better consistency",
    boxplotFastestPace: "Fastest median pace",
    boxplotMostStable: "Most consistent",
    boxplotLargestSpread: "Largest spread",
    boxplotPaceFloor: "Pace floor",
    boxplotMedianPace: "Median pace",
    boxplotTypicalRange: "Typical range",
    boxplotOverallSpread: "Overall spread",
    boxLowerWhisker: "Lower whisker",
    boxQ1: "Q1",
    boxMedian: "Median",
    boxQ3: "Q3",
    boxUpperWhisker: "Upper whisker"
  },
  driver: {
    fastestLap: "Fastest lap",
    throttleBrake: "Throttle / Brake (%)",
    throttle: "Throttle",
    brake: "Brake",
    speed: "Speed"
  },
  mine: {
    title: "Me",
    guestName: "Guest",
    notSet: "Not set",
    peopleUnit: "",
    teamsUnit: "",
    loggedIn: "Logged in",
    guest: "Browsing as guest (login to sync settings)",
    nickPlaceholder: "Enter nickname",
    wechatLogin: "WeChat Login",
    bindDevice: "Bind Device",
    followDrivers: "Follow Drivers",
    followTeams: "Follow Teams",
    currentDeviceId: "Device ID",
    fanProfile: "My F1 Profile",
    fanIdentity: "Season Identity",
    supportSummary: "Follow Summary",
    followOverview: "Follow Summary",
    myDriver: "My Driver",
    myTeam: "My Team",
    noDriverYet: "No followed drivers yet",
    noTeamYet: "No followed teams yet",
    followToBuild: "Pick your follows to build this view",
    seasonSummary: "Season Summary",
    seasonSummaryHint: "Your follows shape news ranking and recommendations",
    profileGuideTitle: "Complete Profile {done}/{total}",
    profileGuideHint: "Add your avatar and nickname to complete your profile.",
    profileGuideAvatar: "Upload Avatar",
    profileGuideAvatarHint: "Tap the avatar on the left to finish this step",
    profileGuideNickname: "Set Nickname",
    profileGuideNicknameHint: "Add the name you want to display",
    profileGuideDone: "Done",
    profileGuideDoneHint: "This step is already completed",
    profileGuideTodo: "To do",
    quickActions: "Quick Actions",
    preferences: "Preferences",
    syncHint: "Login to sync avatar, nickname and follow lists",
    comingNext: "Coming next",
    more: "More",
    standings: "Standings",
    shop: "Shop",
    shopHint: "Browse something fun from the paddock",
    coverUpload: "Upload Cover",
    coverReplace: "Replace Cover",
    coverRemove: "Remove Cover",
    coverCropTitle: "Crop Cover",
    coverCropHint: "Crop to the card ratio, then drag and zoom to frame it.",
    coverCropZoom: "Zoom",
    coverCropReset: "Reset",
    coverCropUse: "Use Image",
    coverPullIdle: "Pull down to change cover",
    coverPullReady: "Release to change cover",
    coverUpdated: "Cover updated",
    coverRemoved: "Cover removed",
    coverUploadFailed: "Failed to upload cover",
    logout: "Logout",
    language: "Language"
  },
  shop: {
    title: "Shop",
    pageTitle: "Shop",
    detailTitle: "Product",
    price: "Price",
    buy: "Buy",
    empty: "No products",
    uiOnly: "UI only, no backend"
  },
  standings: {
    title: "Standings",
    pageTitle: "Standings",
    subtitle: "{season} Season Standings",
    updatedAtUTC: "Updated (UTC): {ts}",
    noData: "No standings data",
    loadFailed: "Failed to load standings",
    drivers: "Drivers",
    teams: "Teams"
  },
  relativeTime: {
    justNow: "Just now",
    minutesAgo: "{n}m ago",
    hoursAgo: "{n}h ago",
    daysAgo: "{n}d ago"
  }
}

function normalizeLocale(locale) {
  const raw = String(locale || "").trim()
  if (!raw) return "zh-CN"
  const v = raw.replace("_", "-")
  if (/^zh\b/i.test(v)) return "zh-CN"
  if (/^en\b/i.test(v)) return "en-US"
  if (SUPPORTED.includes(v)) return v
  return "zh-CN"
}

function getSystemLocale() {
  try {
    const sys = wx.getSystemInfoSync()
    return normalizeLocale(sys && sys.language)
  } catch (e) {
    return "zh-CN"
  }
}

function getLocale() {
  try {
    const v = wx.getStorageSync(STORAGE_KEY)
    const n = normalizeLocale(v)
    if (n) return n
  } catch (e) {}
  try {
    const app = getApp()
    const gd = app && app.globalData
    const n = normalizeLocale(gd && gd.locale)
    if (n) return n
  } catch (e) {}
  return getSystemLocale()
}

function getDict(locale) {
  const l = normalizeLocale(locale || getLocale())
  return l === "en-US" ? EN_US : ZH_CN
}

function getByPath(obj, path) {
  const p = String(path || "").trim()
  if (!p) return undefined
  const parts = p.split(".").filter(Boolean)
  let cur = obj
  for (const k of parts) {
    if (!cur || typeof cur !== "object") return undefined
    cur = cur[k]
  }
  return cur
}

function formatTemplate(str, params) {
  const s = String(str == null ? "" : str)
  const p = params && typeof params === "object" ? params : {}
  return s.replace(/\{(\w+)\}/g, (_, k) => (p[k] == null ? "" : String(p[k])))
}

function t(key, params, locale) {
  const dict = getDict(locale)
  const zh = ZH_CN
  const found = getByPath(dict, key)
  if (typeof found === "string") return formatTemplate(found, params)
  const fallback = getByPath(zh, key)
  if (typeof fallback === "string") return formatTemplate(fallback, params)
  return String(key || "")
}

function emitLocaleChange(next) {
  try {
    const app = getApp()
    const gd = app && app.globalData
    const list = gd && Array.isArray(gd._localeListeners) ? gd._localeListeners : []
    for (const fn of list) {
      try {
        fn && fn(next)
      } catch (e) {}
    }
  } catch (e) {}
}

function onLocaleChange(cb) {
  const fn = typeof cb === "function" ? cb : null
  if (!fn) return () => {}
  try {
    const app = getApp()
    if (!app.globalData) app.globalData = {}
    if (!Array.isArray(app.globalData._localeListeners)) app.globalData._localeListeners = []
    app.globalData._localeListeners.push(fn)
  } catch (e) {}
  return () => {
    try {
      const app = getApp()
      const list = app && app.globalData && app.globalData._localeListeners
      if (!Array.isArray(list)) return
      const idx = list.indexOf(fn)
      if (idx >= 0) list.splice(idx, 1)
    } catch (e) {}
  }
}

function setLocale(locale) {
  const next = normalizeLocale(locale)
  try {
    wx.setStorageSync(STORAGE_KEY, next)
  } catch (e) {}
  try {
    const app = getApp()
    if (!app.globalData) app.globalData = {}
    app.globalData.locale = next
  } catch (e) {}
  emitLocaleChange(next)
  return next
}

module.exports = {
  SUPPORTED,
  normalizeLocale,
  getSystemLocale,
  getLocale,
  setLocale,
  getDict,
  t,
  onLocaleChange
}
