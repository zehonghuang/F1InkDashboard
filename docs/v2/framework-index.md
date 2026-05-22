# 固件框架文档索引（v2）

本文档作为 `framework/*` 分支的“可复用固件框架”入口索引：每个机制一份文档，包含用途、关键 API、典型用法、交互/事件 ASCII 图。

## 快速导航

- 总览与分层： [firmware-framework.md](file:///c:/F1InkDashboard/docs/v2/firmware-framework.md)
- 启动与主循环： [framework-application.md](file:///c:/F1InkDashboard/docs/v2/framework-application.md)
- Board/按键与事件路由： [framework-board-buttons.md](file:///c:/F1InkDashboard/docs/v2/framework-board-buttons.md)
- WiFi（配网 AP + Station + 事件）： [framework-wifi.md](file:///c:/F1InkDashboard/docs/v2/framework-wifi.md)
- HTTP（通用拉取与 URL 工具）： [framework-http.md](file:///c:/F1InkDashboard/docs/v2/framework-http.md)
- OTA（manifest + 下载刷写）： [framework-ota.md](file:///c:/F1InkDashboard/docs/v2/framework-ota.md)
- UI 页面系统（IUiPage/Registry/页面栈）： [framework-ui-pages.md](file:///c:/F1InkDashboard/docs/v2/framework-ui-pages.md)
- 页面内导航状态机（UiNavController）： [framework-ui-nav.md](file:///c:/F1InkDashboard/docs/v2/framework-ui-nav.md)
- Overlay（文本/图片/菜单）与优先级： [framework-overlay.md](file:///c:/F1InkDashboard/docs/v2/framework-overlay.md)
- SleepManager（限睡/延迟/投票）： [framework-sleep.md](file:///c:/F1InkDashboard/docs/v2/framework-sleep.md)
- Settings（KV 存储与作用域）： [framework-settings.md](file:///c:/F1InkDashboard/docs/v2/framework-settings.md)
- 时间同步： [framework-time-sync.md](file:///c:/F1InkDashboard/docs/v2/framework-time-sync.md)
- 音频服务（如后续需要）： [framework-audio.md](file:///c:/F1InkDashboard/docs/v2/framework-audio.md)

## 约定（所有机制文档统一遵循）

- **机制定义**：一个可复用、可替换、可独立测试/演进的模块边界。
- **入口位置**：每份文档开头给出“代码入口文件”与“最短调用链路”。
- **交互图**：每份文档至少提供 1 个 ASCII 图，覆盖事件/调用方向与优先级。
- **复用说明**：明确哪些代码属于框架层、哪些属于业务层；给出“新增业务/新增页面/新增 overlay”的最小步骤。
