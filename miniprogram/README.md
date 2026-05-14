# 赛车遥测仪表盘（微信小程序）

## 目录
- `pages/home`：首页（KPI + Tabs 图表预览）
- `pages/session-detail`：详情页（通道开关 + 多图）
- `pages/settings`：设置与接入（ECharts 检测 + 示例 JSON）

## 依赖
- UI：`tdesign-miniprogram`
- 图表：`echarts` + `echarts-for-weixin`（`ec-canvas` 组件）

本工程已将 TDesign 与 `ec-canvas` 组件放入小程序目录内（`tdesign-miniprogram/` 与 `components/ec-canvas/`），不依赖开发者工具生成 `miniprogram_npm/`。

## 启动方式
1. 进入目录 `c:\F1InkDashboard\miniprogram` 执行 `npm install`
2. 用微信开发者工具导入项目目录：`c:\F1InkDashboard\miniprogram`
3. 预览运行：默认进入首页 `/pages/home/index`

## Mock 数据
- `assets/mock/telemetry-session.json`
- 当前页面直接读取 mock 数据渲染图表；后续接入真实遥测时，只需替换 `services/telemetryService.js` 的数据来源。
