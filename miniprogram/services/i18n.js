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
    standingsHint: "查看本赛季车手和车队积分走势",
    liveTiming: "实时计时",
    liveTimingHint: "进入独立 Live Timing 页面，查看实时榜单和赛控消息",
    tyreIntro: "轮胎指南",
    tyreIntroHint: "看懂五种配方的节奏和策略",
    shop: "商店",
    shopHint: "去围场逛点有意思的",
    shopDesc: "连接微信小店，单独逛周边和精选单品",
    shopEnter: "进入小店",
    shopConfigMissing: "请先配置微信小店 appId",
    shopOpenFailed: "打开微信小店失败",
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
  liveTiming: {
    pageTitle: "实时计时",
    liveEyebrow: "F1 Live Timing",
    updatedAt: "更新时间",
    topTower: "Top Tower",
    fullTower: "完整榜单",
    raceControl: "赛控消息",
    noRaceControl: "当前没有赛控消息",
    loading: "正在连接实时数据...",
    loadFailed: "实时数据加载失败，请稍后重试"
  },
  tyreIntro: {
    pageTitle: "轮胎指南",
    eyebrow: "Pirelli 2026 Compound Guide",
    swipeHint: "左右滑动切换",
    slickLabel: "SLICK",
    wetLabel: "WET",
    metricsTitle: "性能窗口",
    metricGrip: "抓地力",
    metricDurability: "耐久",
    metricWarmup: "升温",
    usageTitle: "适用场景",
    strategyTitle: "策略提示",
    footerTitle: "比赛周末里怎么用",
    footerText: "红黄白是干地配方，通常覆盖排位爆发、均衡比赛节奏和长距离控胎。绿蓝用于潮湿与强降雨场景，帮助车手在积水和低温赛道保持可控性。",
    redName: "红标软胎",
    redShort: "SOFT",
    redSummary: "单圈爆发最强，适合排位和最后一段进攻。",
    redBestFor: "低油、攻击圈、需要立刻抓地的窗口",
    redUsage: "当赛道温度合适、车辆需要快速点燃前轴时，软胎能最快进入工作区，特别适合排位和安全车后的短冲刺。",
    redNote: "速度峰值最高，但热衰减也最快。连续推圈或重油状态下，后段衰退会更明显。",
    yellowName: "黄标中性胎",
    yellowShort: "MEDIUM",
    yellowSummary: "速度和寿命最均衡，是多数正赛策略的主力。",
    yellowBestFor: "主 stint、均衡节奏、想兼顾进站窗口弹性",
    yellowUsage: "中性胎通常是最容易规划策略的配方，既能守住前段节奏，也不会像软胎那样过早过热。",
    yellowNote: "当赛道进化明显时，中性胎经常是 undercut 和 overcut 都能接受的折中解。",
    whiteName: "白标硬胎",
    whiteShort: "HARD",
    whiteSummary: "长距离最稳，适合高温和高磨耗赛道。",
    whiteBestFor: "长 stint、防守轮次、控温控磨耗",
    whiteUsage: "硬胎更适合在长距离中稳定管理胎温和表面磨耗，常用于高温赛道或后半程防守。",
    whiteNote: "进入工作区较慢，若赛道温度偏低或安全车频繁，可能需要更多圈数才会给到足够抓地。",
    greenName: "绿标半雨胎",
    greenShort: "INTER",
    greenSummary: "赛道有水膜但未严重积水时，是最有效率的雨战配方。",
    greenBestFor: "潮湿赛道、干湿转换、喷雾仍可控的路面",
    greenUsage: "半雨胎在有明显排水线但仍持续挂水的情况下最强，既能破水，也保留一定干线速度。",
    greenNote: "一旦赛道快速变干，胎面会很快过热；如果积水进一步加重，又会不如蓝胎安全。",
    blueName: "蓝标全雨胎",
    blueShort: "WET",
    blueSummary: "强降雨和严重积水条件下的安全解。",
    blueBestFor: "大雨、积水、可见度差、需要最大排水能力",
    blueUsage: "全雨胎沟槽最深，排水能力最强，在赛道积水严重、方向盘反馈极不稳定时提供最大余量。",
    blueNote: "一旦赛道接近可跑干线，全雨胎会迅速过热，通常只在最湿的窗口内短时间使用。"
  },
  shop: {
    title: "商店",
    pageTitle: "商店",
    detailTitle: "商品详情",
    price: "价格",
    buy: "购买",
    empty: "暂无商品",
    uiOnly: "仅 UI，无后端",
    connected: "已接入微信小店，点击下方按钮直接跳转到店铺主页。",
    openStore: "进入微信小店",
    appIdLabel: "店铺 AppID",
    howItWorksTitle: "当前接入方式",
    howItWorksDesc: "这里不再做本地假下单，统一通过微信原生能力跳转到店铺小程序，商品浏览、下单和支付都在微信小店内完成。",
    tipTitle: "后续可继续补强",
    tipDesc: "如果你后面给我店铺落地页 path 或具体商品 path，我可以继续把入口改成直达指定会场或指定商品。"
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
    standingsHint: "Check driver and constructor points for the season",
    liveTiming: "Live Timing",
    liveTimingHint: "Open a dedicated live timing page with standings and race control",
    tyreIntro: "Tyre Guide",
    tyreIntroHint: "Understand the pace and role of all five compounds",
    shop: "Shop",
    shopHint: "Browse something fun from the paddock",
    shopDesc: "Open the connected WeChat Store for merch and featured picks",
    shopEnter: "Open Store",
    shopConfigMissing: "Configure the WeChat Store appId first",
    shopOpenFailed: "Failed to open the WeChat Store",
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
  liveTiming: {
    pageTitle: "Live Timing",
    liveEyebrow: "F1 Live Timing",
    updatedAt: "Updated",
    topTower: "Top Tower",
    fullTower: "Full Tower",
    raceControl: "Race Control",
    noRaceControl: "No race control messages yet",
    loading: "Connecting to live timing...",
    loadFailed: "Failed to load live timing"
  },
  tyreIntro: {
    pageTitle: "Tyre Guide",
    eyebrow: "Pirelli 2026 Compound Guide",
    swipeHint: "Swipe to switch",
    slickLabel: "SLICK",
    wetLabel: "WET",
    metricsTitle: "Performance Window",
    metricGrip: "Grip",
    metricDurability: "Life",
    metricWarmup: "Warm-up",
    usageTitle: "Best Used For",
    strategyTitle: "Strategy Note",
    footerTitle: "How Teams Use Them",
    footerText: "Red, yellow and white are dry compounds for quali pace, balanced race stints and long-run tyre management. Green and blue cover mixed and fully wet conditions, keeping the car stable when water and temperature become the main limiters.",
    redName: "Red Soft",
    redShort: "SOFT",
    redSummary: "Maximum single-lap speed for qualifying and late-race attacks.",
    redBestFor: "Low fuel, attack laps and instant front-end grip",
    redUsage: "When the track is ready and the car needs front grip immediately, the soft reaches its window fastest. It suits qualifying and short sprint phases after a restart or safety car.",
    redNote: "It offers the highest peak pace, but also the fastest thermal drop-off. In long or heavy-fuel runs it falls away sooner.",
    yellowName: "Yellow Medium",
    yellowShort: "MEDIUM",
    yellowSummary: "The balanced race tyre and usually the default strategy baseline.",
    yellowBestFor: "Main stints, balanced pace and flexible pit windows",
    yellowUsage: "The medium is often the easiest compound to plan around. It keeps strong early pace without overheating as quickly as the soft.",
    yellowNote: "On evolving tracks it is often the most flexible choice for either undercut or overcut strategy.",
    whiteName: "White Hard",
    whiteShort: "HARD",
    whiteSummary: "The most stable long-run option for heat and abrasion.",
    whiteBestFor: "Long stints, defensive phases and tyre management",
    whiteUsage: "The hard works best when teams need to control surface temperature and wear over a long distance, especially on hot and abrasive tracks.",
    whiteNote: "It takes longer to switch on, so it can feel slow in cool conditions or in races with repeated safety cars.",
    greenName: "Green Intermediate",
    greenShort: "INTER",
    greenSummary: "The fastest answer when the track is wet but not flooded.",
    greenBestFor: "Damp tracks, crossover phases and manageable spray",
    greenUsage: "The intermediate shines when there is standing moisture but still a visible racing line. It clears water while keeping decent speed on the drying line.",
    greenNote: "If the circuit dries quickly it overheats fast. If the water level rises again, the full wet becomes the safer choice.",
    blueName: "Blue Wet",
    blueShort: "WET",
    blueSummary: "The safe option for heavy rain and major standing water.",
    blueBestFor: "Heavy rain, poor visibility and maximum water evacuation",
    blueUsage: "With the deepest grooves and strongest water displacement, the wet provides the biggest safety margin when the track is flooded and the car is difficult to place.",
    blueNote: "As soon as a proper dry line appears it overheats rapidly, so teams only keep it in play during the wettest window."
  },
  shop: {
    title: "Shop",
    pageTitle: "Shop",
    detailTitle: "Product",
    price: "Price",
    buy: "Buy",
    empty: "No products",
    uiOnly: "UI only, no backend",
    connected: "The WeChat Store is now connected. Use the button below to open the store home directly.",
    openStore: "Open WeChat Store",
    appIdLabel: "Store AppID",
    howItWorksTitle: "How it works",
    howItWorksDesc: "This page now hands off to the native WeChat Store mini program instead of a local mock checkout flow. Browsing, ordering and payment stay inside the store.",
    tipTitle: "Next step",
    tipDesc: "If you share a landing path or product path later, I can wire this entry straight to a specific campaign page or product detail."
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
